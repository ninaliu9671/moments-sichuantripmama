'use client';

import Image from 'next/image';
import {
  BedDouble,
  BusFront,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  MapPinned,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { cnDate, type Place, type Trip } from '@/lib/types';
import { getItineraryDetails, itineraryDays, itineraryMapPoints } from '@/lib/itinerary';

type ItineraryViewProps = {
  mode: 'today' | 'route';
  trip: Trip;
  places: Place[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
};

function DayPicker({ trip, selectedDay, onSelectDay }: Omit<ItineraryViewProps, 'mode' | 'places'>) {
  return (
    <div className="itinerary-day-picker" role="group" aria-label="选择行程日期">
      {trip.days.map((day) => (
        <button
          key={day.day}
          type="button"
          aria-pressed={day.day === selectedDay}
          onClick={() => onSelectDay(day.day)}
        >
          <strong>D{day.day}</strong>
          <span>{cnDate(`${day.date}T12:00:00+08:00`, { month: 'numeric', day: 'numeric' })}</span>
        </button>
      ))}
    </div>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="itinerary-fact">
      <span className="itinerary-fact-icon" aria-hidden="true">{icon}</span>
      <div><small>{label}</small><p>{children}</p></div>
    </div>
  );
}

function TodayView({ trip, selectedDay, onSelectDay }: Omit<ItineraryViewProps, 'mode' | 'places'>) {
  const day = trip.days.find((item) => item.day === selectedDay) ?? trip.days[0];
  const details = getItineraryDetails(day?.day);
  if (!day || !details) {
    return <div className="empty-state"><h2>这一天还没有行程</h2><p>请让旅行发起人在旅行设置中补充日期与地点。</p></div>;
  }

  return (
    <div className="itinerary-view">
      <div className="itinerary-heading">
        <p className="eyebrow">TODAY · 今日行程</p>
        <div className="itinerary-day-title"><span>第 {day.day} 天</span><time dateTime={day.date}>{cnDate(`${day.date}T12:00:00+08:00`, { weekday: 'long' })}</time></div>
        <h1>{details.route}</h1>
        <p>{day.title}</p>
      </div>

      <DayPicker trip={trip} selectedDay={selectedDay} onSelectDay={onSelectDay} />

      {details.changeNote && <div className="itinerary-change-note"><CircleAlert aria-hidden="true" /><p>{details.changeNote}</p></div>}

      <section className="itinerary-section" aria-labelledby="essentials-title">
        <h2 id="essentials-title">今天先看这些</h2>
        <div className="itinerary-facts">
          <Fact icon={<Clock3 />} label="集合">{details.meeting}</Fact>
          <Fact icon={<BusFront />} label="交通">{details.transport}</Fact>
          <Fact icon={<Utensils />} label="餐食">{details.meals}</Fact>
          <Fact icon={<BedDouble />} label="住宿">{details.accommodation}</Fact>
        </div>
      </section>

      <section className="itinerary-section" aria-labelledby="schedule-title">
        <h2 id="schedule-title">时间安排</h2>
        <ol className="itinerary-timeline">
          {details.schedule.map((stop, index) => (
            <li key={`${stop.time}-${stop.title}`}>
              <span className="timeline-dot" aria-hidden="true">{index + 1}</span>
              <div><time>{stop.time}</time><h3>{stop.title}</h3><p>{stop.detail}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <details className="itinerary-details">
        <summary><span><Sparkles aria-hidden="true" />展开详情</span><ChevronDown aria-hidden="true" /></summary>
        <div className="itinerary-details-body">
          <section aria-labelledby="attractions-title">
            <h2 id="attractions-title">景点与已含内容</h2>
            {details.attractions.map((attraction) => (
              <article className="attraction-row" key={attraction.name}>
                <h3>{attraction.name}</h3>
                <p>{attraction.description}</p>
                {attraction.included && <p className="included-label">已含：{attraction.included}</p>}
              </article>
            ))}
          </section>
          <section aria-labelledby="optional-title">
            <h2 id="optional-title">自费与可选项目</h2>
            <ul>{details.optional.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="caution-section" aria-labelledby="cautions-title">
            <h2 id="cautions-title">出发前提醒</h2>
            <ul>{details.cautions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <a className="itinerary-pdf-link" href="/itinerary.pdf" target="_blank" rel="noreferrer">
            <FileText aria-hidden="true" />
            <span><strong>查看原始行程单</strong><small>25 页 PDF · 用于核对合同与最终安排</small></span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </details>
    </div>
  );
}

function RouteView({ trip, places, selectedDay, onSelectDay }: Omit<ItineraryViewProps, 'mode'>) {
  const day = trip.days.find((item) => item.day === selectedDay) ?? trip.days[0];
  const details = getItineraryDetails(day?.day);
  const placeNames = new Map(places.map((place) => [place.id, place.name]));
  if (!day || !details) {
    return <div className="empty-state"><h2>路线还没有准备好</h2><p>请选择一个已有安排的日期。</p></div>;
  }

  const activePoints = details.routePlaceIds
    .map((id) => itineraryMapPoints[id])
    .filter((point): point is { x: number; y: number } => Boolean(point));

  return (
    <div className="itinerary-view route-view">
      <div className="route-heading">
        <p className="eyebrow">FULL ROUTE · 全程地图</p>
        <h1>四川 8 日路线</h1>
        <p>切换日期，查看当天计划经过的地点。</p>
      </div>
      <DayPicker trip={trip} selectedDay={selectedDay} onSelectDay={onSelectDay} />

      <section className="illustrated-route-map" aria-label={`第 ${day.day} 天路线：${details.route}`}>
        <Image src="/assets/sichuan-route-concept-v2.png" alt="四川各景点相对方位的手绘概念图" width={1080} height={1470} priority />
        <svg className="route-overlay" viewBox="0 0 100 136.11" aria-hidden="true">
          {itineraryDays.map((item) => {
            const points = item.routePlaceIds.map((id) => itineraryMapPoints[id]).filter(Boolean);
            if (points.length < 2) return null;
            return <polyline key={item.day} className={item.day === selectedDay ? 'active' : ''} points={points.map((point) => `${point.x},${(point.y * 1.3611).toFixed(2)}`).join(' ')} />;
          })}
          {activePoints.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={(point.y * 1.3611).toFixed(2)} r="2.3" />)}
        </svg>
        <span className="map-day-badge">D{day.day}</span>
      </section>

      <div className="route-summary" aria-live="polite">
        <span><MapPinned aria-hidden="true" />第 {day.day} 天</span>
        <h2>{details.route}</h2>
        <p>{day.title}</p>
        <div className="route-place-list">
          {details.routePlaceIds.map((id, index) => (
            <span key={`${id}-${index}`}>{placeNames.get(id) ?? id}{index < details.routePlaceIds.length - 1 && <b aria-hidden="true">→</b>}</span>
          ))}
        </div>
      </div>

      <p className="map-disclaimer"><CalendarDays aria-hidden="true" />地图表示相对方位，不用于导航；动车、天气和票务变化以导游当天通知为准。</p>
    </div>
  );
}

export function ItineraryView(props: ItineraryViewProps) {
  return props.mode === 'today' ? <TodayView {...props} /> : <RouteView {...props} />;
}
