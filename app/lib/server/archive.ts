import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { Snapshot, Member } from '../types';

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const member = (m: Member) => ({ id: m.id, name: m.name, avatar: m.avatar, role: m.role, status: m.status, joinedAt: m.joinedAt });
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
async function sequentialMap<T, R>(items: T[], transform: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) results.push(await transform(item));
  return results;
}

/** A self-contained, versioned private archive. Throws before delivery on any lost or corrupt media. */
export async function createArchive(snapshot: Pick<Snapshot, 'trip' | 'me' | 'members' | 'places' | 'moments' | 'comments' | 'reactions'>, readMedia: (id: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  const files: { path: string; size: number; sha256: string }[] = [];
  const originals = new Map<string, { path: string; sha256: string; size: number }>();
  const add = (path: string, content: string | Uint8Array) => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    zip.file(path, bytes);
    files.push({ path, size: bytes.byteLength, sha256: hash(bytes) });
  };
  // Explicitly select every exported field. Never spread server identity records or signed URLs.
  const data = {
    schemaVersion: 1,
    trip: { id: snapshot.trip.id, title: snapshot.trip.title, startDate: snapshot.trip.startDate, endDate: snapshot.trip.endDate, days: snapshot.trip.days.map(d => ({ day: d.day, date: d.date, title: d.title, placeIds: [...d.placeIds] })) },
    members: snapshot.members.map(member),
    places: snapshot.places.map(p => ({ id: p.id, name: p.name, subtitle: p.subtitle, dayIndices: [...p.dayIndices], mapX: p.mapX, mapY: p.mapY, subplaces: [...p.subplaces] })),
    moments: await sequentialMap(snapshot.moments, async m => ({
      id: m.id, authorId: m.authorId, text: m.text, placeId: m.placeId, subplace: m.subplace, createdAt: m.createdAt, recordedAt: m.recordedAt ?? m.createdAt, updatedAt: m.updatedAt,
      media: await sequentialMap(m.media, async media => {
        if (!/^[a-f\d]{64}$/i.test(media.sha256 ?? '')) throw new Error(`媒体 ${media.id} 缺少有效 SHA-256，归档已停止`);
        if (!Number.isSafeInteger(media.size) || media.size < 1) throw new Error(`媒体 ${media.id} 缺少有效大小`);
        let bytes: Uint8Array;
        try { bytes = await readMedia(media.id); }
        catch (cause) { throw new Error(`无法读取原始媒体 ${media.id}，归档已停止。请重试；若仍失败，请检查原文件是否丢失。`, { cause }); }
        const digest = hash(bytes);
        if (bytes.byteLength !== media.size || digest !== media.sha256.toLowerCase()) throw new Error(`媒体 ${media.id} 完整性校验失败`);
        const prior = originals.get(media.id);
        if (prior && (prior.sha256 !== digest || prior.size !== bytes.byteLength)) throw new Error(`媒体 ${media.id} 元数据冲突`);
        const path = prior?.path ?? `media/${createHash('sha256').update(media.id).digest('hex')}.${extensions[media.mime.split(';')[0]] ?? 'bin'}`;
        if (!prior) { add(path, bytes); originals.set(media.id, { path, sha256: digest, size: bytes.byteLength }); }
        return { id: media.id, type: media.type, url: path, duration: media.duration, name: media.name, mime: media.mime, size: bytes.byteLength, sha256: digest };
      }),
    })),
    comments: snapshot.comments.map(c => ({ id: c.id, momentId: c.momentId, authorId: c.authorId, body: c.body, parentId: c.parentId, createdAt: c.createdAt })),
    reactions: snapshot.reactions.map(r => ({ momentId: r.momentId, userId: r.userId, emoji: r.emoji })),
  };
  const author = (id: string) => escape(data.members.find(m => m.id === id)?.name ?? '已离开的家人');
  const place = (id: string | null) => escape(data.places.find(p => p.id === id)?.name ?? '未选择地点');
  const date = (iso: string) => escape(new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
  const cards = [...data.moments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => `<article id="moment-${escape(m.id)}"><header><b>${author(m.authorId)}</b><span>${date(m.createdAt)} · ${place(m.placeId)} ${escape(m.subplace)}</span></header><p class="text">${escape(m.text)}</p><div class="media">${m.media.map(f => f.type === 'photo' ? `<figure><a href="${escape(f.url)}"><img loading="lazy" src="${escape(f.url)}" alt="${escape(f.name)}"></a><figcaption>${escape(f.name)}</figcaption></figure>` : `<figure><${f.type === 'video' ? 'video' : 'audio'} controls preload="metadata" src="${escape(f.url)}"></${f.type === 'video' ? 'video' : 'audio'}><figcaption><a download href="${escape(f.url)}">${escape(f.name)} · 保存原文件</a></figcaption></figure>`).join('')}</div><p>${data.reactions.filter(r => r.momentId === m.id).map(r => `${author(r.userId)} ${escape(r.emoji)}`).join('　')}</p><section aria-label="评论">${data.comments.filter(c => c.momentId === m.id).map(c => `<div class="comment"><b>${author(c.authorId)}</b>${c.parentId ? ` 回复 ${author(data.comments.find(p => p.id === c.parentId)?.authorId ?? '')}` : ''}<small>${date(c.createdAt)}</small><p class="text">${escape(c.body)}</p></div>`).join('')}</section></article>`).join('');
  add('snapshot.json', JSON.stringify(data, null, 2));
  add('index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(data.trip.title)} · 永久档案</title><style>body{margin:0;background:#f4efe5;color:#292620;font:17px/1.75 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:28px 20px}h1,h2{font-family:serif}article,aside{background:#fbf8f1;border-radius:16px;padding:24px;margin:24px 0}header span,small{display:block;color:#686057;font-size:14px}.text{white-space:pre-wrap;overflow-wrap:anywhere}img,video{max-width:100%;max-height:650px;border-radius:10px}audio{max-width:100%}figure{margin:16px 0}figcaption{font-size:14px}a{color:#a53d2c}.comment{border-top:1px solid #e4dccf;padding:12px 0}li{margin:10px 0}</style></head><body><main><h1>${escape(data.trip.title)}</h1><p>${escape(data.trip.startDate)} — ${escape(data.trip.endDate)} · 完整私人档案</p><p>解压完整文件夹后打开本页，照片、视频与语音均保存在 media 文件夹。请将整个文件夹一起备份；不需要登录或联网。</p><aside><h2>旅行路线</h2><ol>${data.trip.days.map(d => `<li><b>${escape(d.date)} · Day ${d.day} · ${escape(d.title)}</b><br>${d.placeIds.map(place).join(' → ')}</li>`).join('')}</ol><h2>地点与足迹</h2><ul>${data.places.map(p => `<li>${escape(p.name)} · ${data.moments.some(m => m.placeId === p.id) ? '已有记录' : '计划地点'}<br>${escape(p.subtitle)}${p.subplaces.length ? `<br>${p.subplaces.map(escape).join('、')}` : ''}</li>`).join('')}</ul><h2>同行家人</h2><p>${data.members.map(m => author(m.id)).join('、')}</p></aside><h2>旅行瞬间 · ${data.moments.length}</h2>${cards || '<p>这段旅行还没有记录。</p>'}<script type="application/json" id="archive-data">${safeJson(data)}</script></main></body></html>`);
  add('README.txt', 'MOMENTS 完整私人档案 v1\n请先解压整个 ZIP，再打开 index.html。保留 media 目录和所有文件。\nmanifest.json 记录每个文件的 SHA-256 和字节数；snapshot.json 是可迁移的结构化内容。\n本档案含私人旅行内容，请妥善保存。原始 HEIC 或特定视频格式可能需要设备自带播放器打开。\n');
  zip.file('manifest.json', JSON.stringify({ format: 'moments-private-archive', version: 1, createdAt: new Date().toISOString(), counts: { moments: data.moments.length, media: originals.size, comments: data.comments.length, reactions: data.reactions.length }, files }, null, 2));
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  // Validate the actual packaged bytes, not just the source metadata.
  // SHA-256 below validates entries one at a time. JSZip's eager CRC option inflates all entries concurrently.
  const packaged = await JSZip.loadAsync(output);
  const manifestText = await packaged.file('manifest.json')?.async('string');
  if (!manifestText) throw new Error('归档清单缺失');
  const manifest = JSON.parse(manifestText);
  if (manifest.version !== 1 || manifest.format !== 'moments-private-archive' || JSON.stringify(manifest.files) !== JSON.stringify(files)) throw new Error('归档清单校验失败');
  for (const entry of files) {
    const bytes = await packaged.file(entry.path)?.async('uint8array');
    if (!bytes || bytes.byteLength !== entry.size || hash(bytes) !== entry.sha256) throw new Error(`归档文件校验失败：${entry.path}`);
  }
  return output;
}
