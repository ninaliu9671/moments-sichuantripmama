'use client';

import type { Member } from '@/lib/types';

function portraitStyle(id: number) {
 const index = Math.max(0, Math.min(15, id - 1));
 return { backgroundImage: 'url(/assets/traveler-portraits-v1.png)', backgroundSize: '400% 400%', backgroundPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%` };
}

export function Avatar({ member, size = '' }: { member: Pick<Member, 'avatar' | 'name'>; size?: string }) {
 return <span className={`avatar illustrated-avatar ${size}`} role="img" aria-label={`${member.name}的头像`} style={portraitStyle(member.avatar)} />;
}

export function AvatarPicker({ defaultValue = 1 }: { defaultValue?: number }) {
 return <fieldset className="avatar-picker"><legend>选择人物头像</legend><div className="avatar-options">{Array.from({ length: 16 }, (_, i) => <label className="avatar-option" key={i + 1}><input type="radio" name="avatar" value={i + 1} defaultChecked={defaultValue === i + 1} aria-label={`旅行头像 ${i + 1}`} required /><span className="avatar illustrated-avatar" aria-hidden="true" style={portraitStyle(i + 1)} /><span className="avatar-number">{i + 1}</span></label>)}</div></fieldset>;
}
