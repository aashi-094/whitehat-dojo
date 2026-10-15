export const API = import.meta.env.VITE_API_URL ?? "/api";
export async function request<T=Record<string,unknown>>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${API}${path}`,{...options,credentials:"include",headers:{"Content-Type":"application/json",...options.headers}});
  const data=await response.json().catch(()=>({error:{message:"The server returned an invalid response."}}));
  if(!response.ok)throw new Error(data.error?.message??"Request failed");
  return data as T;
}
export function post<T=Record<string,unknown>>(path:string,body?:unknown):Promise<T>{
  return request<T>(path,{method:"POST",body:JSON.stringify(body??{})}).then(data=>{
    if(typeof window!=="undefined")window.dispatchEvent(new Event("dojo:refresh-user"));
    return data;
  });
}
