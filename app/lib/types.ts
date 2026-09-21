export type Role = 'owner' | 'traveler' | 'family';
export type Member = { id: string; name: string; avatar: number; role: Role; status: 'active' | 'left'; joinedAt: string };
export type Place = { id: string; name: string; subtitle: string; dayIndices: number[]; mapX: number; mapY: number; subplaces: string[] };
export type Trip = { id: string; title: string; startDate: string; endDate: string; days: { day: number; date: string; title: string; placeIds: string[] }[] };
export type Media = { id: string; type: 'photo' | 'video' | 'audio'; url: string; thumbUrl?: string; posterUrl?: string; duration: number; name: string; mime: string; size: number; sha256: string };
export type Comment = { id: string; momentId: string; authorId: string; body: string; parentId: string | null; createdAt: string };
export type Reaction = { momentId: string; userId: string; emoji: string };
export type Moment = { id: string; authorId: string; text: string; placeId: string | null; subplace: string; createdAt: string; recordedAt?: string; updatedAt: string; media: Media[] };
export type Snapshot = { trip: Trip; me: Member; members: Member[]; places: Place[]; moments: Moment[]; comments: Comment[]; reactions: Reaction[] };
export type PublicState = { title: string; startDate: string; endDate: string; initialized: boolean; canSetup: boolean };
export type Invite = { enabled: boolean; token?: string; url?: string };
export type AuthResult = { user: Member };
export const AUDIO_LIMIT = 180;
export const VIDEO_LIMIT = 60;
export const emojiOptions = ['❤️', '😂', '🥰', '👍'];
export const avatarUrl = (id: number) => `/assets/avatar-${String(id).padStart(2, '0')}.png`;
export function cnDate(iso: string, options: Intl.DateTimeFormatOptions = {}) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', ...options }).format(new Date(iso)); }
export function timeLabel(iso: string) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
export function dayKey(iso: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
export function secondsLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
