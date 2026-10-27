import React, { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';

export function PopularGamePicker({ siteId, value, pinned, onChange }) {
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const load = async () => {
    setError(''); setLoading(true);
    try { setCatalog((await api(`/cms/api/popular-catalog/?site_id=${encodeURIComponent(siteId)}`)).items); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [siteId]);
  const ids = value.map(item => pinned ? item.gameId : item);
  const move = (index, direction) => {
    const next = [...value], other = index + direction;
    [next[index], next[other]] = [next[other], next[index]];
    onChange(next);
  };
  return <fieldset className="popular-picker"><legend>{t(pinned ? "Pinned games" : "Ordered games")}</legend>
    <p>{t(pinned ? "Positions start at 1. Other games shift down; pins have no public label." : "One mixed list. Use arrows to set the exact order.")}</p>
    {loading && <p role="status">{t("Loading games")}</p>}
    {error && <p role="alert">{error} <button onClick={load}>{t("Try again")}</button></p>}
    <ol>{value.map((item, index) => {
      const id = pinned ? item.gameId : item;
      return <li key={id}><span>{catalog.find(game => game.id === id)?.name || id}</span>
        {pinned ? <label>{t("Position")}<input type="number" min="1" max="200" aria-label={t("Position {name}", { name: id })}
          value={item.position} onChange={event => onChange(value.map((pin, i) => i === index ? { ...pin, position: Number(event.target.value) } : pin))} /></label> :
          <><button disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("Move {name} up", { name: id })}>↑</button>
            <button disabled={index === value.length - 1} onClick={() => move(index, 1)} aria-label={t("Move {name} down", { name: id })}>↓</button></>}
        <button onClick={() => onChange(value.filter((_, i) => index !== i))}>{t("Remove")}</button>
      </li>;
    })}</ol>
    <label>{t("Search games")}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <label>{t("Add game")}<select aria-label={t("Add game")} value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">{t("Select a game")}</option>
      {catalog.filter(game => !ids.includes(game.id) && `${game.name} ${game.provider} ${game.id}`.toLowerCase().includes(query.toLowerCase()))
        .map(game => <option value={game.id} key={game.id}>{game.name} · {game.provider}</option>)}
    </select></label>
    <button disabled={!selected || ids.includes(selected)} onClick={() => {
      onChange([...value, pinned ? { gameId: selected, position: Math.max(0, ...value.map(pin => pin.position)) + 1 } : selected]);
      setSelected('');
    }}>{t("Add")}</button>
  </fieldset>;
}
