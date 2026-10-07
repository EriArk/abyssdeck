// Small public error envelope. Self-contained for serialization into the renderer.
// Never serialize diagnostics, request bodies/headers, stacks or native objects.
export function nativeFailure(error) {
 const code=[error?.code,error?.message].find(value=>typeof value==='string'&&/^NATIVE_[A-Z_]+$/.test(value))??'NATIVE_READ_UNAVAILABLE';
 const result={code};
 const status=error?.httpStatus??error?.responseStatus??error?.status;
 if(Number.isInteger(status)&&status>=400&&status<=599)result.httpStatus=status;
 if(Number.isSafeInteger(error?.retryAt)&&error.retryAt>0)result.retryAt=error.retryAt;
 const message=error?.publicMessage??(error?.type==='fetch-stream-error'?error.error:undefined);
 if(typeof message==='string'&&message.trim())result.publicMessage=message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,2000);
 const providerCode=error?.providerCode??error?.errorCode;
 if(typeof providerCode==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(providerCode))result.providerCode=providerCode;
 return result;
}
