import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out=fileURLToPath(new URL('.',import.meta.url));
const wb=Workbook.create();const s=wb.worksheets.add('Gantt Charts');s.showGridLines=false;
const pink='#B76B92',light='#EAD3DD',bar='#A6497D',ink='#211820';
function col(n){let a='';while(n){n--;a=String.fromCharCode(65+n%26)+a;n=Math.floor(n/26)}return a}
function range(a){return s.getRange(a)}
range('A1:AM70').format.font={name:'Arial',size:10,color:ink};
range('A1:AM70').format.verticalAlignment='center';
range('A1:A70').format.columnWidth=42;range('B1:B70').format.columnWidth=33;range('C1:D70').format.columnWidth=14;
range('E1:AM70').format.columnWidth=4.2;
function merged(a,text,fill=pink){const q=range(a);q.merge();q.values=[[text]];q.format.fill=fill;q.format.font.bold=true;q.format.horizontalAlignment='center';}
function header(r,title,months){let last=4+months.length*5;merged(`A${r}:D${r+1}`,title);merged(`E${r}:${col(last)}${r}`,'Duration in Weeks');
 ['TASK NAME','TASK LEAD','START DATE','END DATE'].forEach((x,i)=>{range(`${col(i+1)}${r+2}`).values=[[x]];});
 range(`A${r+2}:D${r+2}`).format.fill=light;range(`A${r+2}:D${r+2}`).format.font.bold=true;
 months.forEach((m,i)=>{let c=5+i*5;merged(`${col(c)}${r+1}:${col(c+4)}${r+1}`,new Date(Date.UTC(2026,m,1)));range(`${col(c)}${r+1}`).setNumberFormat('mmmm yyyy');for(let w=0;w<5;w++)range(`${col(c+w)}${r+2}`).values=[[w+1]];});
 range(`E${r+2}:${col(last)}${r+2}`).format.fill=light;range(`A${r}:${col(last)}${r+2}`).format.horizontalAlignment='center';
 range(`A${r}:${col(last)}${r+2}`).format.borders={preset:'all',style:'thin',color:ink};range(`A${r}:AM${r+2}`).format.rowHeight=24;return last;}
function serial(str){const [m,d]=str.split('/').map(Number);return (Date.UTC(2026,m-1,d)-Date.UTC(1899,11,30))/86400000}
function row(r,name,owner,start,end,last,active=[]){range(`A${r}:D${r}`).values=[[name,owner,start?serial(start):null,end?serial(end):null]];range(`C${r}:D${r}`).setNumberFormat('mm/dd/yyyy');range(`A${r}:B${r}`).format.wrapText=true;range(`A${r}:AM${r}`).format.rowHeight=36;range(`A${r}:D${r}`).format.fill=r%2?light:'#FFFFFF';for(let c=5;c<=last;c++){range(`${col(c)}${r}`).format.fill=(Math.floor((c-5)/5)%2===0)?'#F1E1E8':'#FFFFFF';if(active.includes(c-5))range(`${col(c)}${r}`).format.fill=bar;}range(`A${r}:${col(last)}${r}`).format.borders={preset:'all',style:'thin',color:'#5C4852'};}
header(1,'ArtFilier\nGANTT CHART 1',[1,2,3]);
let r=4;function section(name){merged(`A${r}:S${r}`,name,'#CCA2B7');range(`A${r}:S${r}`).format.rowHeight=22;r++;}
section('Chapter I');
const tasks1=[
['Title Hearing','All','02/12','02/12',[1]],
['Rationale of the Study','Bordario','02/12','02/25',[2,3,4]],
['Objectives of the Study','Malabago','02/23','03/05',[4,5,6]],
['Scope and Limitation','Malabago','02/23','03/05',[4,5,6]],
['Significance of the Study','Mangallay','03/03','03/03',[5]],
['Flow of the Study','Bordario','03/03','03/03',[5]],
['Definition of Terms','Malabago','03/01','03/07',[5,6]]];
for(const x of tasks1)row(r++,...x.slice(0,4),19,x[4]);
section('Chapter II');
for(const x of [['Related Literature','All','03/09','03/13',[7]],['Related Studies','All','03/15','03/20',[8]],['Comparative Matrix','Bordario','03/15','03/20',[8]]])row(r++,...x.slice(0,4),19,x[4]);
section('Chapter III');
const tasks3=[
['Software Engineering Methodology','Malabago','03/23','03/23',[10]],['Business Model Canvas','Malabago','03/23','03/23',[10]],['Program Workflow','Bordario','03/23','03/27',[10,11]],
['Functional Decomposition Diagram','Malabago','03/23','04/03',[10,11,12]],['Use Case Diagram','Badajos','03/31','04/06',[11,12,13]],['Storyboard','All','03/23','04/03',[10,11,12]],['Entity-Relationship Diagram','Badajos & Mangallay','03/31','04/09',[11,12,13,14]],['Data Dictionary','Mangallay','04/04','04/09',[13,14]],['Network Model','Mangallay','04/04','04/07',[13]],['Network Topology','Mangallay','04/06','04/06',[13]],['Technology Stack Diagram','All','03/23','04/06',[10,11,12,13]],['Software Specification','Badajos','03/31','04/06',[11,12,13]],['Hardware Specification','Badajos','03/31','04/06',[11,12,13]],['List of Modules','All','03/23','04/09',[10,11,12,13,14]],['References','All','04/04','04/09',[13,14]],['Curriculum Vitae','All','04/04','04/09',[13,14]],['Appendices','All','04/07','04/10',[14]]];
for(const x of tasks3)row(r++,...x.slice(0,4),19,x[4]);
const second=r+3;header(second,'ArtFilier\nGANTT CHART 2',[4,5,6,7,8,9,10]);
range(`A${second+2}`).values=[['MODULE']];range(`B${second+2}`).values=[['ASSIGNED PROGRAMMER']];
const J='Mangallay, Jonathan A.',C='Bordario, Charmaine Rianne Q.',M='Malabago, Julienne H.';
const modules=[['Account and Profile Management',J],['Artist Registry and Verification',C],['Art Posting and Management',J],['Marketplace and Shopping Cart',J],['Selling, Messaging and Negotiation',M],['Managing Licenses and Contracts',M],['Royalty Reporting and Management',M],['Auction Module',C],['Commission Module',C],['Logistics and Delivery',C],['Rating and Feedback System',M],['Customer Service Reports',M],['Dispute and Transaction Management',J],['Admin and System Records',J],['Financial Management and Reporting',J]];
const first=second+3;modules.forEach(([n,o],i)=>row(first+i,n,o,null,null,39));
// Week slots follow the reference convention: days 1–7, 8–14, 15–21, 22–28, 29–month end.
modules.forEach((_,i)=>{const rr=first+i;for(let k=0;k<35;k++){const c=5+k,m=4+Math.floor(k/5),w=k%5,sd=(Date.UTC(2026,m,w*7+1)-Date.UTC(1899,11,30))/86400000,ed=(Date.UTC(2026,m,w===4?new Date(Date.UTC(2026,m+1,0)).getUTCDate():w*7+7)-Date.UTC(1899,11,30))/86400000;range(`${col(c)}${rr}`).conditionalFormats.addCustom(`AND(ISNUMBER($C${rr}),ISNUMBER($D${rr}),$C${rr}<=$D${rr},$C${rr}<=${ed},$D${rr}>=${sd})`,{fill:bar});}});
const note=first+modules.length+1;merged(`A${note}:AM${note}`,'Gantt Chart 2: enter module start and end dates to display schedule bars. Week slots: 1–7, 8–14, 15–21, 22–28, 29–month end.','#FFFFFF');range(`A${note}:AM${note}`).format.font={name:'Arial',size:10,italic:true,color:ink};range(`A${note}:AM${note}`).format.rowHeight=28;
s.freezePanes.freezeRows(3);s.freezePanes.freezeColumns(2);
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:`'Gantt Charts'!A${first}:D${first+14}`,tableMaxRows:15,tableMaxCols:4,maxChars:4500})).ndjson);
// Verify conditional-format behavior with a temporary May input, then restore the blank dates.
range(`C${first}:D${first}`).values=[[serial('05/01'),serial('05/14')]];wb.recalculate();
const check=await wb.render({sheetName:'Gantt Charts',range:`A${second}:S${first+4}`,scale:1.3,format:'png'});await fs.writeFile(`${out}/verification.png`,new Uint8Array(await check.arrayBuffer()));
range(`C${first}:D${first}`).values=[[null,null]];wb.recalculate();
for(const [name,area] of [['chart1','A1:S33'],['chart2',`A${second}:AM${note}`]]){const p=await wb.render({sheetName:'Gantt Charts',range:area,scale:1.3,format:'png'});await fs.writeFile(`${out}/${name}.png`,new Uint8Array(await p.arrayBuffer()));}
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?',options:{useRegex:true,maxResults:20},maxChars:500})).ndjson);
await(await SpreadsheetFile.exportXlsx(wb)).save(`${out}/ArtFilier_Gantt_Charts.xlsx`);console.log('Saved workbook');
