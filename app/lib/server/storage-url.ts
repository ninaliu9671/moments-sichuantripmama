export function normalizeSignedUploadUrl(raw: string, envId: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== `${envId}.api.tcloudbasegateway.com`) {
    throw new Error('云存储上传域名不正确');
  }
  // CloudBase JS SDK 3.10.0 currently prefixes /v1/storages twice when it
  // constructs the signed upload URL. The Storage HTTP API accepts one prefix.
  url.pathname = url.pathname.replace(/^\/v1\/storages\/v1\/storages\//, '/v1/storages/');
  if (!url.pathname.startsWith('/v1/storages/object/upload/sign/moments/') || !url.searchParams.has('token')) {
    throw new Error('云存储上传链接不正确');
  }
  return url.href;
}
