// Draws real EAN-13 and UPC-E barcodes for tests: as a bar pattern, as greyscale pixels (for decoding in Node) and as a
// Y4M video (Chromium's fake camera). Used by tests/browser/fitness-scan.test.mjs and scripts/validate-planly-js.mjs.
import fs from 'node:fs';
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const R=L.map(x=>[...x].map(b=>b==='1'?'0':'1').join('')),G=R.map(x=>[...x].reverse().join(''));
export function ean13Modules(code){
  const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'][+code[0]];
  let m='101';for(let i=1;i<=6;i++)m+=(parity[i-1]==='L'?L:G)[+code[i]];m+='01010';for(let i=7;i<=12;i++)m+=R[+code[i]];return m+'101';
}
export function ean8Modules(code){let m='101';for(let i=0;i<4;i++)m+=L[+code[i]];m+='01010';for(let i=4;i<8;i++)m+=R[+code[i]];return m+'101'}
// UPC-A is drawn as the EAN-13 with a leading 0
export const upcaModules=code=>ean13Modules('0'+code);
// UPC-E: number system 0 or 1, six digits, check digit. The check digit is carried by the odd/even pattern of the six.
export function upceModules(code){
  const p0=['EEEOOO','EEOEOO','EEOOEO','EEOOOE','EOEEOO','EOOEEO','EOOOEE','EOEOEO','EOEOOE','EOOEOE'][+code[7]];
  const parity=code[0]==='0'?p0:[...p0].map(x=>x==='E'?'O':'E').join('');
  let m='101';for(let i=1;i<=6;i++)m+=(parity[i-1]==='O'?L:G)[+code[i]];return m+'010101';
}
// greyscale pixels: light background, dark bars, quiet zone on both sides
export function barcodePixels(mods,{w=640,h=480,mod=4,y0=140,y1=340}={}){
  const x0=Math.floor((w-mods.length*mod)/2),Y=Buffer.alloc(w*h,235);
  for(let y=y0;y<y1;y++)for(let i=0;i<mods.length;i++)if(mods[i]==='1')for(let k=0;k<mod;k++)Y[y*w+x0+i*mod+k]=20;
  return {w,h,Y};
}
export function writeY4m(mods,file){
  const {w,h,Y}=barcodePixels(mods),UV=Buffer.alloc(w*h/4,128),frame=Buffer.concat([Buffer.from('FRAME\n'),Y,UV,UV]);
  fs.writeFileSync(file,Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`),frame,frame,frame,frame,frame]));
}
