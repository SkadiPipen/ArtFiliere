const fs = require('fs');
const path = require('path');
const {instance} = require('C:/Users/manga/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@viz-js/viz/dist/viz.cjs');
const root=__dirname;
const schema=JSON.parse(fs.readFileSync(path.join(root,'schema.json'),'utf8'));
const byName=new Map(schema.map(t=>[t.table,t]));
const relations=schema.filter(t=>!t.external).flatMap(t=>t.fields.filter(f=>f.reference_table).map(f=>({parent:f.reference_table,pk:f.reference_column,child:t.table,fk:f.name,nullable:f.null,unique:f.unique})));
const groups=[['users','Users and account applications'],['artist_applications','Artist applications'],['artworks','Artworks'],['cart','Shopping carts'],['auctions','Auctions'],['messaging','Messaging agreements and royalties'],['wallets','Payments wallets and support'],['fulfillment','Delivery and fulfillment'],['commissions','Commissions'],['blockchain','Blockchain and provenance'],['notifications','Notifications'],['delivery','Legacy delivery']];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const q=s=>JSON.stringify(s);
const keyFields=t=>t.fields.filter(f=>f.pk||f.reference_table);
const allFields=t=>t.external?keyFields(t):t.fields;
function dotFor(title,local,edges,full){
 const localNames=new Set(local.map(t=>t.table));
 const names=new Set(localNames);
 edges.forEach(r=>{names.add(r.parent);names.add(r.child)});
 let dot=`digraph ERD { graph [rankdir=LR, bgcolor="white", fontname="Arial", fontsize=12, label=<<FONT POINT-SIZE="18">${esc(title)}</FONT><BR/><FONT POINT-SIZE="10">Parent: 1 or 0..1 | Child: 0..* or 0..1 | PK primary key | FK foreign key | UQ unique</FONT>>, labelloc=t, nodesep=0.65, ranksep=1.5, pad=0.4, splines=ortho, concentrate=false]; node [shape=plain, fontname="Arial", fontsize=10]; edge [fontname="Arial", fontsize=8, color="#64748b", fontcolor="#334155", arrowsize=0.7, dir=both, arrowhead=none, arrowtail=none, labeldistance=2.4];\n`;
 for(const name of names){
  const t=byName.get(name),context=!localNames.has(name)||t.external;
  const fields=context?keyFields(t):(full?allFields(t):keyFields(t));
  const header='#ffffff';
  const fg='#111111';
  let label=`<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#666666" STYLE="ROUNDED"><TR><TD COLSPAN="2" BORDER="1" SIDES="B" BGCOLOR="${header}"><FONT COLOR="${fg}"><B>${esc(name.toUpperCase())}</B>${context?' (reference)':''}</FONT></TD></TR>`;
  for(const f of fields){
   const key=[f.pk?'PK':'',f.reference_table?'FK':'',f.unique&&!f.pk?'UQ':''].filter(Boolean).join(' ');
   label+=`<TR><TD PORT="in_${f.name}" ALIGN="LEFT" BORDER="1" SIDES="R">${key}</TD><TD PORT="out_${f.name}" ALIGN="LEFT">${esc(f.name)}</TD></TR>`;
  }
  label+='</TABLE>';
  dot+=`${q(name)} [id=${q('table-'+name)}, label=<${label}>];\n`;
 }
 for(const [i,r] of edges.entries()){
  dot+=`${q(r.parent)}:${q('out_'+r.pk)}:e -> ${q(r.child)}:${q('in_'+r.fk)}:w [id=${q('relationship-'+i)}, arrowtail=${q(r.nullable?'odottee':'tee')}, arrowhead=${q(r.unique?'odottee':'crowodot')}, tooltip=${q(r.parent+'.'+r.pk+' → '+r.child+'.'+r.fk+' | '+(r.unique?'one-to-one':'one-to-many')+' | parent '+(r.nullable?'0..1':'1')+' child '+(r.unique?'0..1':'0..*'))}];\n`;
 }
 return dot+'}';
}

function addCell(model,attrs,geometry){
 const a=Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ');
 return `<mxCell ${a}>${geometry||''}</mxCell>`;
}
function drawioPage(id,title,local,edges,layout,full){
 const localNames=new Set(local.map(t=>t.table));
 const bb=layout.bb.split(',').map(Number),H=bb[3];
 let cells='<mxCell id="0"/><mxCell id="1" parent="0"/>';
 const nodeByName=new Map(layout.objects.filter(o=>o.pos&&o.name).map(o=>[o.name,o]));
 cells+=addCell(null,{id:'legend',value:title+' — Crow foot = many; circle = optional; bar = one. PK primary key; FK foreign key; UQ unique.',vertex:1,parent:1,style:'text;html=1;align=left;verticalAlign=top;fontSize=16;'},'<mxGeometry x="20" y="0" width="1000" height="70" as="geometry"/>');
 for(const [name,n] of nodeByName){
  const t=byName.get(name),context=!localNames.has(name)||t.external;
  const fields=context?keyFields(t):(full?allFields(t):keyFields(t));
  const [cx,cy]=n.pos.split(',').map(Number);
  const w=Number(n.width)*72,h=Number(n.height)*72;
  const headerHeight=24,rowHeight=(h-headerHeight)/fields.length;
  const x=cx-w/2+30,y=H-cy-Number(n.height)*36+90;
  cells+=addCell(null,{id:'t-'+name,value:name.toUpperCase()+(context?' [reference]':''),vertex:1,parent:1,style:`swimlane;html=1;startSize=${headerHeight};horizontal=1;rounded=1;arcSize=8;fillColor=#ffffff;swimlaneFillColor=#ffffff;fontColor=#111111;strokeColor=#666666;fontSize=11;fontStyle=1;collapsible=0;`},`<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`);
  fields.forEach((f,i)=>{
   const key=[f.pk?'PK':'',f.reference_table?'FK':'',f.unique&&!f.pk?'UQ':''].filter(Boolean).join(' ');
   const text=`${key.padEnd(7)} ${f.name}`;
   cells+=addCell(null,{id:`f-${name}-${f.name}`,value:text,vertex:1,parent:'t-'+name,style:'text;html=0;align=left;verticalAlign=middle;spacingLeft=7;fontFamily=Arial;fontSize=11;fontColor=#172b3a;strokeColor=none;fillColor=none;'},`<mxGeometry x="0" y="${headerHeight+i*rowHeight}" width="${w}" height="${rowHeight}" as="geometry"/>`);
  });
 }
 edges.forEach((r,i)=>{
  cells+=addCell(null,{id:'e-'+i,value:'',edge:1,parent:1,source:`f-${r.parent}-${r.pk}`,target:`f-${r.child}-${r.fk}`,style:`edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;fontSize=10;fontColor=#334155;labelBackgroundColor=#ffffff;strokeColor=#888888;startArrow=${r.nullable?'ERzeroToOne':'ERone'};endArrow=${r.unique?'ERzeroToOne':'ERzeroToMany'};startSize=14;endSize=14;`},'<mxGeometry relative="1" as="geometry"/>');
 });
 return `<diagram id="${id}" name="${esc(title)}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="0" pageScale="1" pageWidth="1169" pageHeight="827"><root>${cells}</root></mxGraphModel></diagram>`;
}

(async()=>{
 const viz=await instance();
 const pages=[],views=[];
 const application=schema.filter(t=>!t.external);
 const specs=[['complete','Complete ERD with all fields',application,relations,true],['overview','Complete ERD with keys only',application,relations,false],...groups.map(([app,title])=>[app,title,application.filter(t=>t.app===app),relations.filter(r=>byName.get(r.child).app===app),true])];
 for(const [id,title,tables,edges,full] of specs){
  const dot=dotFor(title,tables,edges,full);
  fs.writeFileSync(path.join(root,id+'.dot'),dot);
  const result=viz.renderFormats(dot,['svg','json']);
  if(result.status!=='success') throw new Error(JSON.stringify(result.errors));
  const svg=result.output.svg,layout=JSON.parse(result.output.json);
  fs.writeFileSync(path.join(root,id+'.svg'),svg);
  fs.writeFileSync(path.join(root,id+'-layout.json'),result.output.json);
  pages.push(drawioPage(id,title,tables,edges,layout,full));
  views.push({id,title,svg});
  console.log(id+': '+layout.objects.filter(o=>o.pos).length+' tables, '+edges.length+' relationships');
 }
 fs.writeFileSync(path.join(root,'ArtFiliere Complete ERD.drawio'),'<mxfile host="app.diagrams.net" version="24.7.17">'+pages.join('')+'</mxfile>');
 let mermaid='erDiagram\n';
 for(const t of schema){
  mermaid+=`    ${t.table} {\n`;
  for(const f of allFields(t)){
   const type=f.db_type.replace(/[^a-zA-Z0-9_]/g,'_');
   const keys=[f.pk?'PK':'',f.reference_table?'FK':'',f.unique&&!f.pk?'UK':''].filter(Boolean).join(',');
   mermaid+=`        ${type} ${f.name}${keys?' '+keys:''}${f.null?' "nullable"':''}\n`;
  }
  mermaid+='    }\n';
 }
 for(const r of relations) mermaid+=`    ${r.parent} ${r.nullable?'|o':'||'}--${r.unique?'o|':'o{'} ${r.child} : "${r.fk}"\n`;
 fs.writeFileSync(path.join(root,'ArtFiliere Complete ERD.mmd'),mermaid);
 const csv=['Parent table,Parent key,Child table,Foreign key,Relationship,Parent per child,Children per parent',...relations.map(r=>[r.parent,r.pk,r.child,r.fk,r.unique?'one-to-one':'one-to-many',r.nullable?'0..1':'1',r.unique?'0..1':'0..many'].join(','))].join('\n');
 fs.writeFileSync(path.join(root,'relationships.csv'),csv);
 fs.writeFileSync(path.join(root,'views.json'),JSON.stringify(views));
 fs.writeFileSync(path.join(root,'README.md'),`# ArtFiliere complete ERD\n\n73 application tables, 805 application columns, 171 declared foreign keys, plus auth_user as a referenced framework table.\n\nOpen ArtFiliere ERD.html for the zoomable diagrams. Open ArtFiliere Complete ERD.drawio in diagrams.net to edit the table boxes and connectors. There are 14 pages: complete with all fields, complete with keys only, and 12 module diagrams. ArtFiliere Complete ERD.mmd is the equivalent editable Mermaid source.\n\nEach module shows its local tables with all columns and all foreign keys belonging to those local tables. Referenced tables outside the module show key fields only. All 171 foreign keys appear in both complete diagrams and in their child table's module.\n\n1 means exactly one parent; 0..1 means an optional parent or at most one child; 0..* means zero or more children. No minimum child count is inferred from a foreign key. A unique foreign key gives a one-to-one relationship. ? marks nullable columns. PK = primary key, FK = foreign key, UQ = unique.\n\nNo relationship is invented for JSON values, text identifiers or matching city names. delivery_route, artwork_ai_scan and provenance_signer therefore appear without foreign key connections. Legacy delivery tables remain separate; legacy_rider_profile references auth_user rather than the application user table.\n\nDatabase and application code were not changed.\n`);
 if(application.length!==73||relations.length!==171||application.reduce((s,t)=>s+t.fields.length,0)!==805) throw new Error('Schema totals changed; review output.');
})();
