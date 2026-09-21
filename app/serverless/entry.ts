// Bundled by scripts/bundle-api.mjs into functions/moments/bundle.mjs.
// The route file only exports GET/POST/PATCH/DELETE (all bound to the same
// handler), so re-export one of them under a stable name. lib/server/* is
// reused verbatim.
export { GET as handle } from '../app/api/[...path]/route';
