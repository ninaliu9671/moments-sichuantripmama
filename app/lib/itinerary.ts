import type { Trip } from './types';

export type ItineraryStop = {
  time: string;
  title: string;
  detail: string;
};

export type ItineraryAttraction = {
  name: string;
  description: string;
  included?: string;
};

export type ItineraryDayDetails = {
  day: number;
  route: string;
  meeting: string;
  transport: string;
  meals: string;
  accommodation: string;
  routePlaceIds: string[];
  schedule: ItineraryStop[];
  attractions: ItineraryAttraction[];
  optional: string[];
  cautions: string[];
  changeNote?: string;
};

export const itineraryDays: ItineraryDayDetails[] = [
  {
    day: 1,
    route: '上海 → 成都',
    meeting: '按自己的航班抵达；成都机场 24 小时接机',
    transport: '飞机抵达，专车接机送酒店',
    meals: '早 / 午 / 晚餐均自理',
    accommodation: '成都明悦、东方丽致或雅悦蓝天酒店，以最终安排为准',
    routePlaceIds: ['chengdu'],
    schedule: [
      { time: '抵达后', title: '机场接机', detail: '抵达成都双流或天府机场后，联系接机人员前往酒店。' },
      { time: '约 11:00 起', title: '成都自由活动', detail: '可按抵达时间自行安排市区游览，门票和市内交通自理。' },
    ],
    attractions: [
      { name: '成都自由活动', description: '可选宽窄巷子、锦里、武侯祠、杜甫草堂或春熙路，不设固定游览顺序。' },
    ],
    optional: ['自由活动景点门票与市内交通自理', '成都小吃与川菜可按家人口味自行选择'],
    cautions: ['核对姓名与证件信息，优惠证件带原件', '自由活动时保管好手机、证件和随身物品', '酒店以旅行社最终通知为准'],
  },
  {
    day: 2,
    route: '成都 → 松潘 / 黄龙九寨站 → 黄龙 → 九寨沟',
    meeting: '早餐后集合，具体动车车次与集合时间待导游确认',
    transport: '动车 + 景区接驳；黄龙至九寨沟约 150 km / 2 小时',
    meals: '含早餐、晚餐；午餐自理',
    accommodation: '九寨沟天源豪生、丽呈花园或甘海云涧',
    routePlaceIds: ['chengdu', 'huanglong', 'jiuzhaigou'],
    schedule: [
      { time: '早餐后', title: '成都乘动车出发', detail: '前往黄龙九寨站或松潘站，车次与抵达站以出票为准。' },
      { time: '抵达后', title: '黄龙主沟', detail: '接驳进入黄龙，计划游览约 4 小时。' },
      { time: '游览后', title: '前往九寨沟', detail: '乘车前往九寨沟住宿，若抵店较晚，藏家火锅可能调整到今晚。' },
    ],
    attractions: [
      { name: '黄龙主沟', description: '以钙化彩池、峡谷、雪山与森林景观为主，海拔较高。', included: '团队行程含主景区游览，具体进场时段以票务为准。' },
    ],
    optional: ['黄龙保险 10 元', '上行索道 80 元、下行索道 40 元', '观光电瓶车往返 20 元，数量有限', '讲解器 30 元'],
    cautions: ['注意高原反应，放慢速度并及时补水', '带保暖、防晒和防雨用品', '车次和景点顺序可能因票务、天气或路况调整'],
    changeNote: '黄龙与三星堆可能因团队票时段在第 2 天、第 4 天之间调换，以导游通知为准。',
  },
  {
    day: 3,
    route: '九寨沟景区全天',
    meeting: '早餐后集合进入景区，预计约 17:00 出景区',
    transport: '景区观光车 + 步行，游览约 8 小时',
    meals: '含早餐、藏式土火锅晚餐；午餐自理',
    accommodation: '川主寺亚日国际、九寨沟甘海云涧或天源豪生',
    routePlaceIds: ['jiuzhaigou'],
    schedule: [
      { time: '早餐后', title: '进入九寨沟', detail: '随讲解员和景区观光车游览 Y 字三沟。' },
      { time: '全天', title: '三沟主要景点', detail: '则查洼沟、日则沟、树正沟的开放点位按现场安排游览。' },
      { time: '行程内', title: '藏服旅拍', detail: '约 15 分钟，含 1 套藏服和头饰、3 张电子精修及全部底片，不含妆造。' },
    ],
    attractions: [
      { name: '九寨沟 Y 字三沟', description: '计划覆盖长海、五彩池、诺日朗瀑布、树正瀑布、树正寨、珍珠滩瀑布等开放景点。' },
      { name: '藏服旅拍', description: '地点以树正寨旅拍馆门口安排为准。', included: '藏服、头饰、3 张电子精修与全部底片。' },
    ],
    optional: ['观光车 90 元、保险 10 元', '诺日朗餐厅午餐参考 60–138 元 / 人，也可自带午餐'],
    cautions: ['游览顺序听从随车讲解员安排', '禁止下河、翻栏、采摘和违规吸烟', '停车场过路时先看车辆，不要低头看手机', '晚餐歌舞为场地赠送项目，可能临时取消'],
  },
  {
    day: 4,
    route: '九寨沟 → 爱情海 → 三星堆 → 成都',
    meeting: '约 09:00 到爱情海；动车与三星堆进场时间待出票确认',
    transport: '旅游车 + 动车 + 市内接驳',
    meals: '含早餐、午餐；晚餐自理',
    accommodation: '成都东方丽致、明悦或豪生 Club 酒店',
    routePlaceIds: ['jiuzhaigou', 'love-sea', 'sanxingdui', 'chengdu'],
    schedule: [
      { time: '09:00', title: '爱情海（甘海子）', detail: '计划游览约 1 小时。' },
      { time: '12:00', title: '团队午餐', detail: '午餐后前往松潘乘动车往成都方向。' },
      { time: '约 15:30', title: '三星堆博物馆', detail: '计划游览约 2 小时，最终场次以预约为准。' },
      { time: '晚间', title: '返回成都', detail: '入住成都酒店，晚餐自行安排。' },
    ],
    attractions: [
      { name: '爱情海（甘海子）', description: '位于九寨沟核心景区以南约 24 km 的 G544 沿线，是独立景区。', included: '金犀牛海、芳草海、九曲彩河等计划点位。' },
      { name: '三星堆博物馆', description: '展示古蜀文明重要出土文物，参观时段受团队票预约影响。' },
    ],
    optional: ['三星堆电子耳麦约 30 元'],
    cautions: ['三星堆可能改期、改夜场或替换为其他博物馆', '如无法成行并安排自由活动，成人门票按原约定处理'],
    changeNote: '黄龙与三星堆可能按出票情况前后调序，页面路线是计划而非不可变承诺。',
  },
  {
    day: 5,
    route: '成都 → 熊猫基地 → 都江堰 → 成都',
    meeting: '约 07:20 成都集合出发',
    transport: '旅游车；成都至熊猫基地约 35 分钟，之后至都江堰约 1.5 小时',
    meals: '三餐均含；晚餐为火锅 + 变脸',
    accommodation: '成都东方丽致或明悦酒店',
    routePlaceIds: ['chengdu', 'panda-base', 'dujiangyan', 'chengdu'],
    schedule: [
      { time: '07:20', title: '成都出发', detail: '前往成都大熊猫繁育研究基地。' },
      { time: '上午', title: '成都熊猫基地', detail: '计划游览约 2 小时。' },
      { time: '13:00', title: '前往都江堰', detail: '约 14:30 开始游览，计划约 2 小时。' },
      { time: '晚间', title: '火锅与变脸', detail: '返回成都用晚餐，之后可自选锦里夜景。' },
    ],
    attractions: [
      { name: '成都大熊猫繁育研究基地', description: '位于成都成华区熊猫大道，不是都江堰熊猫乐园。' },
      { name: '都江堰', description: '重点看鱼嘴、飞沙堰、宝瓶口三大主体工程，可按现场路线经过安澜桥、二王庙。' },
    ],
    optional: ['熊猫基地观光车与耳麦费用以现场确认为准，PDF 有 30 / 45 元两种口径', '都江堰电瓶车 20 元、耳麦 15 元'],
    cautions: ['熊猫活动状态受气温和现场情况影响', '晚间锦里为自由选择，不影响团队返程安排'],
  },
  {
    day: 6,
    route: '成都 → 峨眉山金顶 → 山脚住宿',
    meeting: '早餐后集合，具体时间以导游通知为准',
    transport: '旅游车 + 景区观光车 + 步行 / 索道',
    meals: '三餐均含',
    accommodation: '峨眉山橘子树汤泉或世纪阳光大酒店',
    routePlaceIds: ['chengdu', 'emeishan'],
    schedule: [
      { time: '上午', title: '成都前往峨眉山', detail: '计划车程约 140 km / 2 小时。' },
      { time: '午餐后', title: '上山前往金顶', detail: '观光车至雷洞坪，步行约 1.5 km 到接引殿，再乘索道或步行。' },
      { time: '下午', title: '金顶游览', detail: '计划约 3 小时，约 16:30 后摆渡至山脚酒店。' },
    ],
    attractions: [
      { name: '峨眉山金顶', description: '主要看十方普贤像、华藏寺、金殿、银殿、铜殿与观景台。' },
    ],
    optional: ['观光车 90 元（行程注明必须消费）', '金顶往返索道旺季 120 元', '保险 20 元', '峨眉山 / 乐山讲解耳机合计约 30 元'],
    cautions: ['山上温差大，备好外套和防雨用品', '雷洞坪至接引殿有步行路段，穿防滑鞋', 'PDF 对一处车程距离记载矛盾，页面采用约 140 km / 2 小时口径'],
  },
  {
    day: 7,
    route: '峨眉山 → 乐山大佛 → 成都',
    meeting: '早餐后集合；如改乐山游船，须提前 1 天告知导游',
    transport: '景区交通 + 旅游车；乐山登山或游船二选一',
    meals: '含早餐、午餐；晚餐自理',
    accommodation: '成都东方丽致或明悦酒店',
    routePlaceIds: ['emeishan', 'leshan', 'chengdu'],
    schedule: [
      { time: '上午', title: '峨眉山中山区', detail: '生态猴区、万年寺等，计划约 4 小时。' },
      { time: '午餐后', title: '前往乐山大佛', detail: '默认登山游览约 2 小时。' },
      { time: '游览后', title: '返回成都', detail: '北返成都入住酒店，晚餐自行安排。' },
    ],
    attractions: [
      { name: '峨眉山中山区', description: '按开放情况游览生态猴区、万年寺等山中点位。' },
      { name: '乐山大佛', description: '默认登山近看，也可提前选择约 40–45 分钟白日游船。', included: '登山与游船是二选一，不会同时作为必经项目。' },
    ],
    optional: ['万年寺上行索道 65 元、小门票 10 元', '二次进峨眉山观光车 40 元', '乐山景区观光车或游船费用以现场安排为准'],
    cautions: ['猴区保管好食物和随身物品，不主动逗引野生猴', '登山注意湿滑台阶', '游船受水位、客流和满员发船影响'],
  },
  {
    day: 8,
    route: '成都 → 上海',
    meeting: '按返程航班集合送机；双流 / 车站提前 3 小时，天府机场提前 4 小时出发',
    transport: '专车送机 + 返程航班',
    meals: '含早餐；午餐、晚餐自理',
    accommodation: '当晚返回家中',
    routePlaceIds: ['chengdu'],
    schedule: [
      { time: '早餐后', title: '整理行李', detail: '核对证件和行李，最迟 12:00 前退房。' },
      { time: '按航班', title: '送机返程', detail: '当天无导游、正餐和常规用车，以返程安排为最高优先级。' },
    ],
    attractions: [
      { name: '成都自由时间', description: '如航班时间允许可就近自由活动，但必须预留足够送机时间。' },
    ],
    optional: ['自由活动产生的交通、门票与餐饮费用自理'],
    cautions: ['出门前再次确认身份证件和航班信息', '不要因临时游览压缩机场值机时间', '12:00 前完成酒店退房'],
  },
];

export const itineraryMapPoints: Record<string, { x: number; y: number }> = {
  jiuzhaigou: { x: 40, y: 7 },
  'love-sea': { x: 25, y: 13 },
  huanglong: { x: 13, y: 19 },
  sanxingdui: { x: 81, y: 33 },
  dujiangyan: { x: 25, y: 38 },
  'panda-base': { x: 89, y: 45 },
  chengdu: { x: 61, y: 51 },
  emeishan: { x: 35, y: 61 },
  leshan: { x: 60, y: 63 },
};

export function getItineraryDetails(day: number): ItineraryDayDetails | undefined {
  return itineraryDays.find((item) => item.day === day);
}

export function resolveTripDay(days: Trip['days'], today: string): number {
  if (!days.length) return 1;
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (today <= ordered[0].date) return ordered[0].day;
  if (today >= ordered[ordered.length - 1].date) return ordered[ordered.length - 1].day;
  return [...ordered].reverse().find((item) => item.date <= today)?.day ?? ordered[0].day;
}
