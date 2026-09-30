const homeArt = [
  'https://image.lukklycdn.com/workshop/games/1cccd586-b650-4ee8-adb9-ee882c135671.webp',
  'https://image.lukklycdn.com/workshop/games/26e0678c-49ac-4e79-b7a2-99155481a9bf.webp',
  'https://image.lukklycdn.com/workshop/games/4d3e2468-c3f3-4ffc-a553-1a4fd95b39a3.webp',
  'https://image.lukklycdn.com/workshop/games/a9583eec-9102-4a95-8e09-36d7c37765a4.webp',
  'https://image.lukklycdn.com/workshop/games/fc839f9a-0ee3-48fd-880a-4b4271b24829.webp',
  'https://image.lukklycdn.com/workshop/games/191338a2-129d-4686-bcd6-6e135e4ce631.webp',
  'https://image.lukklycdn.com/workshop/games/b219a817-acaf-4107-91c8-cb793f7a9916.webp',
  'https://image.lukklycdn.com/workshop/games/8cd1df74-6df8-4c74-89c0-41a9a77932e4.webp',
  'https://image.lukklycdn.com/workshop/games/8795d15b-8126-475a-ace2-391ccbbfdcae.webp',
  'https://image.lukklycdn.com/workshop/games/c54d1a14-90c3-401d-9278-5ad883833774.webp',
];
const imageAt = (index) => homeArt[index % homeArt.length];
const gameGroups = [
  { title: 'Popular', games: ['Neon Koi', 'Turbo 7s', 'Cosmic Reels', 'Lucky Lanterns', 'Prize Galaxy', 'Cherry Heat', 'Golden Grid', 'Wild Orbit', 'Fortune Drop'] },
  { title: 'Trending now', games: ['Moon Mission', 'Pixel Fortune', 'Wild Bloom', 'Candy Comet', 'Rocket Riches', 'Star Catcher', 'Mystic Mint', 'Firefly Spins', 'Jackpot Jam'] },
  { title: 'Big publishers', games: ['Gates of Olympus', 'Book of Dead', 'Sweet Bonanza', 'Reactoonz', 'Big Bass Bonanza', 'Legacy of Dead', 'Jammin’ Jars', 'The Dog House', 'Rise of Merlin'] },
];
const sportsGroups = [
  { title: 'Popular matches', games: ['Champions League', 'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Europa League', 'World Cup', 'MLS'] },
  { title: 'Live now', games: ['Live football', 'Live basketball', 'Live tennis', 'Live hockey', 'Live volleyball', 'Live baseball', 'Live cricket', 'Live darts', 'Live esports'] },
  { title: 'Top sports', games: ['Football', 'Basketball', 'Tennis', 'Ice hockey', 'Volleyball', 'Baseball', 'Cricket', 'Rugby', 'Esports'] },
];
const categories = [['✦', 'Slots'], ['♠', 'Table games'], ['●', 'Live casino'], ['⚽', 'Sportsbook'], ['▶', 'Live games'], ['♛', 'Tournaments'], ['♦', 'Jackpots'], ['★', 'New games'], ['◈', 'Promotions'], ['♜', 'Top picks']];
const promoSlides = [
  ['777% + 777 free spins', 'A brighter welcome starts here'], ['100% deposit boost', 'Make your first session count'], ['Monday reload', 'Fresh rewards for a new week'], ['Weekend cashback', 'Get more from every spin'], ['Free spins festival', 'A little extra on selected slots'],
  ['Golden hour bonus', 'Catch a limited-time reward'], ['High roller boost', 'A bigger offer for bigger play'], ['Daily drop', 'Check back for your next reward'], ['Lucky streak', 'Keep the good times rolling'], ['Birthday bonus', 'Celebrate with a special treat'],
];
const featuredPromos = [
  ['Welcome to Nexluck', '777% + 777 free spins'], ['Cashback weekend', 'Get up to 12% back'], ['Spin and win', 'Daily free-spin drops'], ['Golden hour', 'Limited-time deposit boost'], ['The big reload', 'Extra value on your next top-up'],
  ['Lucky streak', 'Keep playing for more rewards'], ['Birthday treat', 'A little something for your day'], ['VIP rewards', 'Offers made for loyal players'], ['New game bonus', 'Try the latest releases'], ['Sunday special', 'A new week starts lucky'],
];
const tournamentSlides = [
  ['Blue Hour', '€25,000', '2,431 playing'], ['Lucky League', '€12,500', '1,208 playing'], ['High Roller Run', '€50,000', '487 playing'], ['Neon Nights', '€8,000', '962 playing'], ['Golden Spin Cup', '€15,000', '1,532 playing'],
  ['Weekend Rush', '€10,000', '846 playing'], ['Star Catcher Series', '€20,000', '1,104 playing'], ['Royal Table', '€7,500', '328 playing'], ['Fortune Dash', '€5,000', '711 playing'], ['Grand Jackpot Race', '€75,000', '2,024 playing'],
];
const matches = [
  ['Northbridge FC', 'Real Madrid', 'Champions League', '20:00', '2.45', '3.20', '2.75'], ['Manchester City', 'Arsenal', 'Premier League', '18:30', '1.92', '3.60', '3.90'],
  ['Barcelona', 'Atletico Madrid', 'La Liga', '21:00', '1.85', '3.40', '4.10'], ['Juventus', 'Inter Milan', 'Serie A', '19:45', '2.60', '3.10', '2.55'],
  ['Bayern Munich', 'Dortmund', 'Bundesliga', '17:30', '1.70', '4.00', '4.50'], ['Lyon', 'Monaco', 'Ligue 1', '20:15', '2.10', '3.30', '3.20'],
  ['Ajax', 'PSV', 'Eredivisie', '18:00', '2.35', '3.50', '2.80'], ['Porto', 'Benfica', 'Primeira Liga', '20:30', '2.50', '3.00', '2.65'],
  ['Celtic', 'Rangers', 'Scottish Premiership', '16:00', '2.20', '3.25', '3.10'], ['LA Galaxy', 'Seattle Sounders', 'MLS', '22:00', '2.15', '3.40', '3.05'],
];
const providers = ['Pragmatic Play', 'Evolution', 'Play’n GO', 'NetEnt', 'Relax Gaming', 'Push Gaming', 'Hacksaw Gaming', 'Thunderkick', 'Quickspin'];
const winners = [['luna.play', '€1,240.00'], ['Rico77', '€560.00'], ['MilaV', '€890.40'], ['AceRunner', '€2,480.00'], ['JaxOnFire', '€390.00'], ['LuckyFox', '€720.50'], ['NoraK', '€1,105.00'], ['spinmaster', '€248.80'], ['Mira_Queen', '€3,200.00'], ['LeoWins', '€645.25']];
const tournamentWinners = [['Blue Hour', 'luna.play', '€2,400.00', '1st'], ['Lucky League', 'MilaV', '€1,250.00', '2nd'], ['High Roller Run', 'AceRunner', '€5,000.00', '1st'], ['Neon Nights', 'Rico77', '€800.00', '3rd'], ['Golden Spin Cup', 'NoraK', '€1,500.00', '1st'], ['Weekend Rush', 'LuckyFox', '€900.00', '2nd'], ['Star Catcher Series', 'JaxOnFire', '€2,200.00', '1st'], ['Royal Table', 'Mira_Queen', '€650.00', '3rd'], ['Fortune Dash', 'LeoWins', '€500.00', '2nd'], ['Grand Jackpot Race', 'spinmaster', '€7,500.00', '1st']];

const fillSlider = (selector, items, render) => { document.querySelector(selector).innerHTML = items.map(render).join(''); };
fillSlider('#home-promo-track', promoSlides, ([title, body], i) => `<article class="home-feature-card" style="--home-art:url('${imageAt(i)}')"><span class="eyebrow">PROMOTION ${String(i + 1).padStart(2, '0')}</span><h3>${title}</h3><p>${body}</p><button data-action="deposit">Deposit</button></article>`);
fillSlider('#home-category-track', categories, ([icon, label]) => `<button class="home-category-card"><span>${icon}</span><small>${label}</small></button>`);
const categoryTrack = document.querySelector('#home-category-track');
window.setInterval(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const end = categoryTrack.scrollWidth - categoryTrack.clientWidth;
  if (categoryTrack.scrollLeft >= end - 4) categoryTrack.scrollTo({ left: 0, behavior: 'smooth' });
  else categoryTrack.scrollBy({ left: categoryTrack.firstElementChild?.getBoundingClientRect().width || 80, behavior: 'smooth' });
}, 3000);
fillSlider('#match-track', matches, ([home, away, league, time, one, draw, two], i) => `<article class="match-card" style="--match-art:url('${imageAt(i + 3)}')"><span class="match-league">${league} · ${time}</span><strong>${home}<i>vs</i>${away}</strong><div class="match-odds"><button data-match="${home} vs ${away}">1 <b>${one}</b></button><button data-match="${home} vs ${away}">X <b>${draw}</b></button><button data-match="${home} vs ${away}">2 <b>${two}</b></button></div></article>`);
fillSlider('#provider-grid', providers, (name, i) => `<button class="provider-card provider-${i + 1}" data-provider="${name}"><span>${name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><strong>${name}</strong></button>`);
fillSlider('#offer-track', featuredPromos, ([title, body], i) => `<article class="home-feature-card" style="--home-art:url('${imageAt(i + 4)}')"><span class="eyebrow">NEXLUCK OFFER</span><h3>${title}</h3><p>${body}</p><button data-action="deposit">Deposit</button></article>`);
fillSlider('#home-tournament-track', tournamentSlides, ([title, prize, players], i) => `<article class="home-feature-card tournament-feature" style="--home-art:url('${imageAt(i + 6)}')"><span class="eyebrow">TOURNAMENT · ${players}</span><h3>${title}</h3><p>${prize} prize pool</p><button data-tournament="${title}">View tournament</button></article>`);
document.querySelector('#home-wins').innerHTML = winners.map(([name, amount], i) => `<tr><td><img src="${imageAt(i)}" alt="" loading="lazy" /><span>${gameGroups[i % gameGroups.length].games[i % 9]}</span></td><td>${name}</td><td>${amount}</td></tr>`).join('');
document.querySelector('#tournament-winners').innerHTML = tournamentWinners.map(([tournament, player, amount, place], i) => `<tr><td><img src="${imageAt(i + 2)}" alt="" loading="lazy" /><span>${tournament}</span></td><td>${player}</td><td>${amount}<small>${place}</small></td></tr>`).join('');

const gameGroupsRoot = document.querySelector('#home-game-groups');
const searchInput = document.querySelector('#home-game-search');
const renderGameGroups = (groups) => {
  gameGroupsRoot.innerHTML = groups.map((group, groupIndex) => `<section class="home-game-group"><div class="home-category-heading"><h3>${group.title}</h3><button data-action="deposit">View all →</button></div><div class="home-game-grid">${group.games.map((name, i) => `<button class="home-game-tile" data-game="${name}"><img src="${imageAt(groupIndex * 3 + i)}" alt="" loading="lazy" /><strong>${name}</strong><small>${group.title}</small></button>`).join('')}</div></section>`).join('');
  applyGameSearch();
};
const applyGameSearch = () => {
  const query = searchInput.value.trim().toLowerCase();
  document.querySelectorAll('.home-game-group').forEach((group) => {
    const tiles = [...group.querySelectorAll('.home-game-tile')];
    tiles.forEach((tile) => { tile.hidden = !tile.dataset.game.toLowerCase().includes(query); });
    group.hidden = !tiles.some((tile) => !tile.hidden);
  });
};
renderGameGroups(gameGroups);
searchInput.addEventListener('input', applyGameSearch);

let activeMode = 'casino';
let toastTimer;
const toastNode = document.querySelector('#home-toast');
const showToast = (message) => {
  toastNode.textContent = message;
  toastNode.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastNode.classList.remove('visible'), 2400);
};
const setMode = (mode) => {
  activeMode = mode;
  document.body.dataset.mode = mode;
  const sports = mode === 'sports';
  document.querySelector('#home-mode-label').textContent = sports ? 'Casino' : 'Sport';
  document.querySelector('#home-mode-icon').textContent = sports ? '♠' : '⚽';
  document.querySelector('.mode-toggle').setAttribute('aria-label', `Switch to ${sports ? 'casino' : 'sportsbook'} mode`);
  document.querySelectorAll('.casino-only').forEach((section) => { section.hidden = sports; });
  if (sports) document.querySelector('#sportsbook-matches').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'deposit') { showToast('Deposit checkout is ready to connect.'); return; }
  if (action === 'search') {
    if (activeMode !== 'casino') setMode('casino');
    document.querySelector('#home-games').scrollIntoView({ behavior: 'smooth' });
    window.setTimeout(() => searchInput.focus(), 350);
    return;
  }
  if (action === 'mode') { setMode(activeMode === 'casino' ? 'sports' : 'casino'); return; }
  if (action === 'menu') { document.querySelector('#home-menu').hidden = false; return; }
  const closeMenu = event.target.closest('[data-close-menu]');
  if (closeMenu) { document.querySelector('#home-menu').hidden = true; return; }
  const notice = event.target.closest('[data-notice]');
  if (notice) { showToast(notice.dataset.notice); return; }
  const match = event.target.closest('[data-match]');
  if (match) { showToast(`${match.dataset.match} added to your bet slip.`); return; }
  const tournament = event.target.closest('[data-tournament]');
  if (tournament) { showToast(`${tournament.dataset.tournament} details are ready.`); return; }
  const game = event.target.closest('[data-game]');
  if (game) showToast(`${game.dataset.game} is ready to play.`);
});
document.querySelectorAll('[data-scroll-track]').forEach((button) => button.addEventListener('click', () => {
  document.getElementById(button.dataset.scrollTrack)?.scrollBy({ left: Number(button.dataset.direction) * 300, behavior: 'smooth' });
}));
document.querySelector('.balance-select select').addEventListener('change', (event) => { document.querySelector('.balance-select > span').textContent = `Balance · ${event.target.value.split(' ')[1]}`; });