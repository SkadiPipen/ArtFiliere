const fs=require('fs'),path=require('path');
const root=__dirname;
const schema=JSON.parse(fs.readFileSync(path.join(root,'schema.json'),'utf8'));
const views=JSON.parse(fs.readFileSync(path.join(root,'views.json'),'utf8')).map(v=>({...v,svg:v.svg.slice(v.svg.indexOf('<svg'))}));
const relations=schema.filter(t=>!t.external).flatMap(t=>t.fields.filter(f=>f.reference_table).map(f=>({parent:f.reference_table,pk:f.reference_column,child:t.table,fk:f.name,nullable:f.null,unique:f.unique})));
let template=fs.readFileSync(path.join(root,'viewer-template.html'),'utf8');
template=template.replace('__VIEWS__',()=>JSON.stringify(views)).replace('__SCHEMA__',()=>JSON.stringify(schema)).replace('__RELATIONS__',()=>JSON.stringify(relations));
fs.writeFileSync(path.join(root,'ArtFiliere ERD.html'),template);
console.log('Created offline viewer with',views.length,'diagrams.');
