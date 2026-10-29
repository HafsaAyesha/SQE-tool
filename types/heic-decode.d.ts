declare module 'heic-decode' {
  type Image={width:number;height:number;data:Uint8ClampedArray};
  type LazyImages=Array<{width:number;height:number;decode():Promise<Image>}> & {dispose():void};
  const decode:{all(options:{buffer:Uint8Array}):Promise<LazyImages>};
  export default decode;
}
