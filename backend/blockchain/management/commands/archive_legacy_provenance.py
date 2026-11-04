"""Preserve the incompatible v1 ledger before installing the current migrations."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
from datetime import datetime, timezone

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


TABLES = (
    'blockchain_provenanceasset',
    'blockchain_provenanceevent',
    'blockchain_provenancelisting',
    'blockchain_provenanceparty',
    'blockchain_provenanceproof',
    'blockchain_entitlement',
    'blockchain_entitlementreservation',
)


def fingerprint(cursor, qualified_table):
    """Compare complete row contents without logging personal or signed data."""
    cursor.execute(f'SELECT row_to_json(t)::text FROM {qualified_table} t ORDER BY row_to_json(t)::text')
    digest = hashlib.sha256()
    count = 0
    for row in cursor:
        digest.update(row[0].encode('utf-8'))
        digest.update(b'\n')
        count += 1
    return count, digest.hexdigest()


class Command(BaseCommand):
    help = 'Preview legacy provenance archival; --apply requires a verified full database backup.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--schema', default='artfiliere_legacy_provenance_20261028')
        parser.add_argument('--pg-bin', help='Directory containing pg_dump and pg_restore.')

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            raise CommandError('This recovery command supports PostgreSQL only.')
        schema = options['schema']
        if not re.fullmatch(r'artfiliere_legacy_provenance_[a-z0-9_]{1,25}', schema):
            raise CommandError('Use a dedicated artfiliere_legacy_provenance_ archive schema.')
        quote = connection.ops.quote_name
        with connection.cursor() as cursor:
            cursor.execute('SELECT current_schema()')
            if cursor.fetchone()[0] != 'public':
                raise CommandError('Expected the live tables in the public schema.')
            cursor.execute('SELECT 1 FROM pg_namespace WHERE nspname = %s', [schema])
            if cursor.fetchone():
                raise CommandError('Archive schema already exists. Inspect it; do not overwrite it.')
            existing = set(connection.introspection.table_names(cursor))
            if not set(TABLES).issubset(existing):
                raise CommandError('The complete expected v1 ledger was not found; no changes made.')
            columns = {col.name for col in connection.introspection.get_table_description(cursor, 'blockchain_provenanceevent')}
            if not {'asset_id', 'sequence', 'previous_hash', 'reconstructed'}.issubset(columns) or 'record_id' in columns:
                raise CommandError('The event table is not the known incompatible v1 schema.')
            columns = {col.name for col in connection.introspection.get_table_description(cursor, 'blockchain_provenancelisting')}
            if 'asset_id' not in columns or 'record_id' in columns:
                raise CommandError('The listing table is not the expected v1 schema.')
            if {'blockchain_provenanceartwork', 'blockchain_provenancesigner', 'blockchain_provenancereview'} & existing:
                raise CommandError('Part of the newer ledger already exists. Inspect before proceeding.')
            for table in TABLES:
                count, _ = fingerprint(cursor, 'public.' + quote(table))
                self.stdout.write(f'{table}: {count} rows to preserve')
            cursor.execute('''SELECT child.relname FROM pg_constraint con
                JOIN pg_class child ON child.oid = con.conrelid
                JOIN pg_class parent ON parent.oid = con.confrelid
                JOIN pg_namespace ns ON ns.oid = parent.relnamespace
                WHERE con.contype = 'f' AND ns.nspname = 'public'
                AND parent.relname = ANY(%s) AND NOT (child.relname = ANY(%s))''', [list(TABLES), list(TABLES)])
            if cursor.fetchall():
                raise CommandError('Other live tables reference this ledger. A reviewed conversion is required.')
        if not options['apply']:
            self.stdout.write('Preview only. No schema, data, or migration history changed.')
            return

        suffix = '.exe' if os.name == 'nt' else ''
        binaries = []
        for name in ('pg_dump', 'pg_restore'):
            executable = str(Path(options['pg_bin']) / (name + suffix)) if options['pg_bin'] else shutil.which(name)
            if not executable or not Path(executable).is_file():
                raise CommandError(f'{name} is unavailable; supply --pg-bin. No tables changed.')
            binaries.append(executable)
        backup_dir = Path(settings.BASE_DIR).parent / '.local' / 'backups'
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / ('before-provenance-archive-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.dump')
        config = connection.settings_dict
        env = os.environ.copy()
        for key, value in {
            'PGDATABASE': config['NAME'], 'PGHOST': config.get('HOST'),
            'PGPORT': config.get('PORT'), 'PGUSER': config.get('USER'),
            'PGPASSWORD': config.get('PASSWORD'),
        }.items():
            if value:
                env[key] = str(value)
        dump = subprocess.run([binaries[0], '--no-password', '--format=custom', '--file', str(backup)], env=env, capture_output=True, timeout=180)
        if dump.returncode or not backup.exists() or not backup.stat().st_size:
            raise CommandError('Full database backup failed. No tables changed; check PostgreSQL client/connectivity.')
        verify = subprocess.run([binaries[1], '--list', str(backup)], capture_output=True, timeout=30)
        if verify.returncode:
            raise CommandError('Backup could not be read. No tables changed.')
        backup_hash = hashlib.sha256(backup.read_bytes()).hexdigest()
        self.stdout.write(f'Full database backup: {backup}')
        self.stdout.write(f'Backup SHA-256: {backup_hash}')

        # ALTER TABLE SET SCHEMA also moves owned sequences and indexes. Foreign
        # keys continue to point to the same tables, preserving the whole ledger.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '5s'")
                cursor.execute('LOCK TABLE ' + ', '.join('public.' + quote(t) for t in TABLES) + ' IN ACCESS EXCLUSIVE MODE')
                before = {t: fingerprint(cursor, 'public.' + quote(t)) for t in TABLES}
                cursor.execute('CREATE SCHEMA ' + quote(schema))
                for table in TABLES:
                    cursor.execute('ALTER TABLE public.' + quote(table) + ' SET SCHEMA ' + quote(schema))
                after = {t: fingerprint(cursor, quote(schema) + '.' + quote(t)) for t in TABLES}
                if before != after:
                    raise CommandError('Archived contents do not match; archive transaction rolled back.')
        self.stdout.write(self.style.SUCCESS('All v1 ledger rows preserved and content-checked in ' + schema))
        self.stdout.write('Migration history and blockchain data were not modified. Now run manage.py migrate.')
