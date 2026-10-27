import React, { useEffect, useState } from 'react';
import { t } from './i18n';

export function PopularSkeleton({ count = 10, layout = 'row' }) {
  return <div className={`popular-track popular-loading popular-${layout}`} aria-label={t("Loading games")} role="status">
    {Array.from({ length: count }, (_, index) => <span className="popular-skeleton" key={index} />)}
  </div>;
}

export function PopularState({ error, onRetry, viewAllUrl }) {
  const browse = new URL(viewAllUrl, location.href);
  browse.searchParams.set('browse', '1');
  return <div className="popular-state" role={error ? 'alert' : 'status'}>
    <p>{t(error ? "Games didn't load" : "No games here yet")}</p>
    {error ? <button onClick={onRetry}>{t("Try again")}</button> :
      <a href={browse.href}>{t("Browse all games")}</a>}
  </div>;
}

export function rankingSubtitle(ranking, now = Date.now()) {
  if (!ranking) return '';
  const minutes = ranking.period.minutes;
  const period = minutes <= 60 ? t("right now (last {minutes} min)", { minutes }) :
    minutes % 1440 === 0 ? t("over the last {days} days", { days: minutes / 1440 }) :
      minutes % 60 === 0 ? t("over the last {hours} hours", { hours: minutes / 60 }) :
        t("over the last {minutes} min", { minutes });
  const region = ranking.country === 'WORLD' ? t("across all countries") : t("in {country}", { country: ranking.countryName || ranking.country });
  const age = Math.max(0, Math.floor((now - Date.parse(ranking.updatedAt)) / 60000));
  const metric = t(ranking.metric === 'play_count' ? "play count" : "bet volume");
  return t("Ranked by {metric} {region} {period}, updated {minutes} min ago", { metric, region, period, minutes: age }) +
    (ranking.personalized ? '. ' + t("Sorted to your taste") : '');
}

export function PopularGames({ data, fullList, islandKey }) {
  const [favourites, setFavourites] = useState(data.favourites);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [subtitle] = useState(() => rankingSubtitle(data.ranking));
  useEffect(() => {
    const section = document.getElementById(islandKey);
    const eyebrow = section?.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = t("TOP {count} IN {country}", {
      count: fullList ? data.items.length : data.homeLimit,
      country: (data.ranking?.countryName || (data.country && data.country !== 'WORLD' ?
        new Intl.DisplayNames([document.documentElement.lang], { type: 'region' }).of(data.country) : t("All countries"))).toUpperCase()
    });
  }, []);
  const toggle = async game => {
    setBusy(game.id); setError('');
    try {
      const csrf = document.cookie.split('; ').find(value => value.startsWith('nexluck_cms_csrf='))?.split('=')[1];
      const response = await fetch(data.favouriteUrl, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf || '' },
        body: JSON.stringify({ gameId: game.id, favourite: !favourites.includes(game.id) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || t("Couldn't save favourite."));
      setFavourites(result.items.map(item => item.gameId));
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  const tile = (game, index, compact = false, list = false) => <article
    className={`popular-tile${compact ? ' popular-small' : ''}${list ? ' popular-list-item' : ''}`}
    key={game.id} data-game-id={game.id}>
    {fullList && <span className="popular-position">{String(index + 1).padStart(2, '0')}</span>}
    {game.image ? <img src={game.image} alt="" loading="lazy" /> : <div className="popular-no-image" aria-hidden="true">◇</div>}
    <div className="popular-game-copy"><strong>{game.name}</strong>{!compact && <small>{game.provider}</small>}
      <span className="popular-badges">{game.badges.map(badge => <span key={badge} className={`popular-badge badge-${badge.toLowerCase()}`}>{badge}</span>)}</span>
    </div>
    {data.signedIn && <button className="popular-favourite" aria-label={t("Favourite {name}", { name: game.name })}
      aria-pressed={favourites.includes(game.id)} disabled={!!busy || data.favouriteError} onClick={() => toggle(game)}>
      {favourites.includes(game.id) ? '♥' : '♡'}
    </button>}
  </article>;
  return <>
    {data.demo && <p className="popular-demo">{t("Demo ranking — not real player activity.")}</p>}
    {data.stale && <p className="popular-saved" role="status">{t("Showing saved ranking.")}</p>}
    {data.favouriteError && <p role="alert">{t("Favourites are unavailable. Reload to try again.")}</p>}
    {error && <p role="alert">{error}</p>}
    {fullList && subtitle && <p className="popular-subtitle">{subtitle}</p>}
    {fullList ? <>
      <div className="popular-podium">{data.items.slice(0, 3).map((game, index) => tile(game, index))}</div>
      <div className="popular-list">{data.items.slice(3).map((game, index) => tile(game, index + 3, false, true))}</div>
    </> : <div className={`popular-track popular-${data.layout}`} tabIndex="0" aria-label={data.title}>
      {data.items.slice(0, data.homeLimit).map((game, index) => tile(game, index, data.layout === 'double'))}
    </div>}
  </>;
}
