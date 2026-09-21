const zone = 'Asia/Shanghai';

export function shanghaiMinuteInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (kind: string) => parts.find(part => part.type === kind)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

export function shanghaiMinuteToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请选择完整的年月日和时间。');
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime()) || shanghaiMinuteInput(date.toISOString()) !== value) throw new Error('请选择有效的记录时间。');
  if (date.getTime() > Date.now()) throw new Error('记录时间不能晚于现在。');
  return date.toISOString();
}
