import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const projectRoot=resolve('.');
const root=resolve(process.env.PREVIEW_DIST==='1'?'dist':'web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.f64':'application/octet-stream','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const shared=url.pathname==='/LICENSE'||url.pathname==='/README.md';
    const base=shared?projectRoot:root,p=resolve(base,'.'+decodeURIComponent(url.pathname));
    if(p!==base&&!p.startsWith(base+sep)){res.writeHead(403).end();return;}
    const path=(await stat(p)).isDirectory()?resolve(p,'index.html'):p;
    res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(path));
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT??4178),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
