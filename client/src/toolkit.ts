export async function digestText(algorithm: "SHA-1"|"SHA-256"|"SHA-512", text: string): Promise<string> {
  const bytes=await crypto.subtle.digest(algorithm,new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export function md5(text:string):string {
  const bytes=new TextEncoder().encode(text), words:number[]=[];
  for(let i=0;i<bytes.length;i++)words[i>>2]=(words[i>>2]??0)|(bytes[i]<<(i%4*8));
  words[bytes.length>>2]=(words[bytes.length>>2]??0)|(0x80<<(bytes.length%4*8));
  const n=((bytes.length+8>>6)+1)*16;while(words.length<n)words.push(0);words[n-2]=bytes.length*8;
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const k=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
  for(let offset=0;offset<words.length;offset+=16){
    let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){
      let f:number,g:number,s:number;
      if(i<16){f=(b&c)|(~b&d);g=i;s=shifts[i%4]!;}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;s=shifts[4+i%4]!;}
      else if(i<48){f=b^c^d;g=(3*i+5)%16;s=shifts[8+i%4]!;}
      else{f=c^(b|~d);g=(7*i)%16;s=shifts[12+i%4]!;}
      const x=(a+f+k[i]!+(words[offset+g]??0))|0;
      const rotated=(x<<s)|(x>>>(32-s));
      [a,d,c,b]=[d,c,b,(b+rotated)|0];
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return [a0,b0,c0,d0].map(x=>[0,8,16,24].map(shift=>((x>>>shift)&255).toString(16).padStart(2,"0")).join("")).join("");
}
export const encodeText=(mode:string,value:string,shift=13):string=>{
  if(mode==="Base64")return btoa(unescape(encodeURIComponent(value)));
  if(mode==="URL")return encodeURIComponent(value);
  if(mode==="Hex")return [...new TextEncoder().encode(value)].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(mode==="Binary")return [...new TextEncoder().encode(value)].map(x=>x.toString(2).padStart(8,"0")).join(" ");
  if(mode==="ROT13"||mode==="Caesar")return [...value].map(ch=>{const code=ch.charCodeAt(0);const base=code>=65&&code<=90?65:code>=97&&code<=122?97:0;return base?String.fromCharCode((code-base+(mode==="ROT13"?13:shift)+26)%26+base):ch;}).join("");
  return value;
};
export const decodeText=(mode:string,value:string,shift=13):string=>{
  try{
    if(mode==="Base64")return decodeURIComponent(escape(atob(value)));
    if(mode==="URL")return decodeURIComponent(value);
    if(mode==="Hex")return new TextDecoder().decode(new Uint8Array((value.match(/.{1,2}/g)??[]).map(x=>parseInt(x,16))));
    if(mode==="Binary")return new TextDecoder().decode(new Uint8Array(value.trim().split(/\s+/).map(x=>parseInt(x,2))));
    if(mode==="ROT13"||mode==="Caesar")return encodeText(mode,value,-(mode==="ROT13"?13:shift));
    return value;
  }catch{return "Invalid input for selected encoding";}
};
export const caesarShifts=(value:string)=>Array.from({length:25},(_,i)=>({shift:i+1,text:encodeText("Caesar",value,i+1)}));
export function analyzePassword(value:string){
  const sets=[/[a-z]/.test(value)?26:0,/[A-Z]/.test(value)?26:0,/\d/.test(value)?10:0,/[^a-zA-Z0-9]/.test(value)?33:0];
  const pool=sets.reduce((a,b)=>a+b,0), entropy=value.length*Math.log2(Math.max(pool,1));
  const common=new Set(["password","password123","123456789","qwerty","letmein","admin","welcome","iloveyou","changeme"]);
  const isCommon=common.has(value.toLowerCase());
  const seconds=2**entropy/1e10;
  const crackTime=seconds<1?"under a second":seconds<60?`${Math.round(seconds)} seconds`:seconds<3600?`${Math.round(seconds/60)} minutes`:seconds<86400?`${Math.round(seconds/3600)} hours`:seconds<31557600?`${Math.round(seconds/86400)} days`:seconds<31557600*100?`${Math.round(seconds/31557600)} years`:"centuries";
  const score=value.length===0?0:Math.min(100,Math.round(entropy/100*100)-(isCommon?60:0));
  const tips:string[]=[];
  if(value.length<14)tips.push("Use at least 14 characters; a longer passphrase is easier to remember.");
  if(!/[a-z]/.test(value)||!/[A-Z]/.test(value))tips.push("Mix upper- and lower-case letters.");
  if(!/\d/.test(value)||!/[^\w]/.test(value))tips.push("Add digits and symbols, or choose several random words.");
  if(isCommon)tips.push("This is a commonly used password; choose a unique one.");
  if(tips.length===0)tips.push("Excellent length and variety. Use this password for only one account.");
  return {entropy:Number(entropy.toFixed(1)),isCommon,crackTime,score,tips};
}
export function decodeJwt(token:string){
  const parts=token.split(".");
  if(parts.length!==3)return {error:"A JWT must contain three dot-separated parts."};
  try{
    const parse=(part:string)=>JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")))));
    const header=parse(parts[0]!),payload=parse(parts[1]!);
    const exp=typeof payload.exp==="number"?new Date(payload.exp*1000):null;
    return {header,payload,expiry:exp?.toISOString()??null,expired:exp?exp.getTime()<Date.now():null,warning:"Decoding is not verifying. Never trust claims without validating the signature."};
  }catch{return {error:"JWT header or payload is not valid Base64URL JSON."};}
}
export function analyzeHeaders(raw:string){
  const map=new Map<string,string>();
  const cookies:string[]=[];
  raw.split(/\r?\n/).forEach(line=>{const i=line.indexOf(":");if(i>0){const key=line.slice(0,i).trim().toLowerCase(),value=line.slice(i+1).trim();if(key==="set-cookie")cookies.push(value);else map.set(key,value);}});
  const checks=[
    ["Content-Security-Policy","CSP",true],["Strict-Transport-Security","HSTS",true],["X-Frame-Options","Clickjacking protection",true],
    ["X-Content-Type-Options","MIME sniffing protection",true],["Referrer-Policy","Referrer privacy",true],["Permissions-Policy","Browser features",true]
  ] as const;
  const results:Array<{label:string;value:string;present:boolean;required:boolean}>=checks.map(([key,label,required])=>({label,value:map.get(key.toLowerCase())??"",present:map.has(key.toLowerCase()),required}));
  for(const [name,re] of [["Secure",/\bsecure\b/i],["HttpOnly",/\bhttponly\b/i],["SameSite",/\bsamesite=(strict|lax|none)\b/i]] as const){const present=cookies.length>0&&cookies.every(cookie=>re.test(cookie));results.push({label:`Cookie ${name}`,value:cookies.length?present?"Present on every cookie":"Missing on one or more cookies":"No Set-Cookie header",present,required:true});}
  return results;
}
export const ports=[
  {port:20,protocol:"FTP data",note:"Legacy; prefer secure alternatives."},{port:21,protocol:"FTP control",note:"Unencrypted by default."},
  {port:22,protocol:"SSH",note:"Secure remote administration; restrict access."},{port:25,protocol:"SMTP",note:"Mail transfer."},
  {port:53,protocol:"DNS",note:"Name resolution over UDP/TCP."},{port:80,protocol:"HTTP",note:"Unencrypted web traffic."},
  {port:110,protocol:"POP3",note:"Legacy mail retrieval."},{port:123,protocol:"NTP",note:"Time synchronization."},
  {port:143,protocol:"IMAP",note:"Mail retrieval."},{port:443,protocol:"HTTPS",note:"HTTP protected by TLS."},
  {port:445,protocol:"SMB",note:"File sharing; restrict and patch."},{port:3306,protocol:"MySQL",note:"Database service; do not expose publicly."},
  {port:3389,protocol:"RDP",note:"Remote desktop; restrict and use MFA."},{port:5432,protocol:"PostgreSQL",note:"Database service; do not expose publicly."}
];
