const landingArt = [
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

const recentWins = [
  ['luna.play', '€1,240.00'], ['Rico77', '€560.00'], ['MilaV', '€890.40'], ['AceRunner', '€2,480.00'], ['JaxOnFire', '€390.00'],
  ['LuckyFox', '€720.50'], ['NoraK', '€1,105.00'], ['spinmaster', '€248.80'], ['Mira_Queen', '€3,200.00'], ['LeoWins', '€645.25'],
];

const promotions = [
  ['777% + 777 free spins', 'A brighter welcome starts here'], ['100% first deposit boost', 'Make your first session count'], ['Monday reload', 'Fresh rewards for a new week'],
  ['Weekend cashback', 'Get more from every spin'], ['Free spins festival', 'A little extra on selected slots'], ['Golden hour bonus', 'Catch a limited-time reward'],
  ['High roller boost', 'A bigger offer for bigger play'], ['Daily drop', 'Check back for your next reward'], ['Lucky streak', 'Keep the good times rolling'], ['Birthday bonus', 'Celebrate with a special treat'],
];

const tournaments = [
  ['Blue Hour', '€25,000', '2,431 playing'], ['Lucky League', '€12,500', '1,208 playing'], ['High Roller Run', '€50,000', '487 playing'],
  ['Neon Nights', '€8,000', '962 playing'], ['Golden Spin Cup', '€15,000', '1,532 playing'], ['Weekend Rush', '€10,000', '846 playing'],
  ['Star Catcher Series', '€20,000', '1,104 playing'], ['Royal Table', '€7,500', '328 playing'], ['Fortune Dash', '€5,000', '711 playing'], ['Grand Jackpot Race', '€75,000', '2,024 playing'],
];

const winGameNames = ['Neon Koi', 'Turbo 7s', 'Cosmic Reels', 'Lucky Lanterns', 'Prize Galaxy', 'Cherry Heat', 'Golden Grid', 'Wild Orbit', 'Fortune Drop', 'Jackpot Jam'];
const imageFor = (index) => landingArt[index % landingArt.length];
const gameGrid = document.querySelector('#game-categories');
const gameSearch = document.querySelector('#game-search');

const applyGameSearch = () => {
  const query = gameSearch.value.trim().toLowerCase();
  document.querySelectorAll('.game-category').forEach((category) => {
    const games = [...category.querySelectorAll('.game-tile')];
    games.forEach((game) => { game.hidden = !game.dataset.game.toLowerCase().includes(query); });
    category.hidden = !games.some((game) => !game.hidden);
  });
};
const renderGameGroups = (groups) => {
  gameGrid.innerHTML = groups.map((group, groupIndex) => `<section class="game-category"><div class="category-heading"><h3>${group.title}</h3><button class="category-link" data-auth="signup">View all <span>→</span></button></div><div class="game-grid">${group.games.map((name, index) => `<button class="game-tile" data-game="${name}" aria-label="Open ${name}"><img src="${imageFor(groupIndex * 3 + index)}" alt="" loading="lazy" /><span>${name}</span><small>${group.title}</small></button>`).join('')}</div></section>`).join('');
  applyGameSearch();
};
let activeMode = 'casino';
renderGameGroups(gameGroups);
gameSearch.addEventListener('input', applyGameSearch);

const winsTrack = document.querySelector('#wins-track');
const winsWindow = document.querySelector('.wins-window');
winsTrack.innerHTML = recentWins.map(([name, amount], index) => `<article class="win-card"><img src="${imageFor(index)}" alt="" loading="lazy" /><strong>${name}</strong><span>${amount}</span></article>`).join('');
window.setInterval(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const end = winsWindow.scrollWidth - winsWindow.clientWidth;
  if (winsWindow.scrollLeft >= end - 4) winsWindow.scrollTo({ left: 0, behavior: 'smooth' });
  else winsWindow.scrollBy({ left: winsTrack.firstElementChild?.getBoundingClientRect().width || 80, behavior: 'smooth' });
}, 2600);
document.querySelector('#promo-track').innerHTML = promotions.map(([title, body], index) => `<article class="feature-card promo-card-item" style="--card-art:url('${imageFor(index + 2)}')"><span class="eyebrow">NEXLUCK PROMOTION</span><h3>${title}</h3><p>${body}</p><button data-auth="signup">Explore offer <span>→</span></button></article>`).join('');
document.querySelector('#tournament-track').innerHTML = tournaments.map(([title, prize, players], index) => `<article class="feature-card tournament-card-item" style="--card-art:url('${imageFor(index + 5)}')"><span class="eyebrow">TOURNAMENT · ${players}</span><h3>${title}</h3><p>${prize} prize pool</p><button data-auth="signup">View tournament <span>→</span></button></article>`).join('');
document.querySelector('#winners-list').innerHTML = recentWins.map(([name, amount], index) => `<tr><td><img src="${imageFor(index)}" alt="" loading="lazy" /><span>${winGameNames[index]}</span></td><td>${name}</td><td>${amount}</td></tr>`).join('');

const authModal = document.querySelector('#auth-modal');
const menuDrawer = document.querySelector('#menu-drawer');
const toast = document.querySelector('#landing-toast');
let toastTimer;
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
};
const showAuth = (mode) => {
  const signup = mode !== 'signin';
  document.querySelector('#auth-title').textContent = signup ? 'Sign up' : 'Sign in';
  document.querySelector('#auth-copy').textContent = signup ? 'Create an account to explore games and offers.' : 'Sign in to continue to your Nexluck account.';
  authModal.hidden = false;
  document.body.classList.add('modal-open');
};
const closeOverlays = () => {
  authModal.hidden = true;
  menuDrawer.hidden = true;
  document.body.classList.remove('modal-open');
};

document.addEventListener('click', (event) => {
  const authButton = event.target.closest('[data-auth]');
  if (authButton) { showAuth(authButton.dataset.auth); return; }
  const scrollButton = event.target.closest('[data-scroll]');
  if (scrollButton) { document.querySelector(scrollButton.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }); return; }
  const arrow = event.target.closest('[data-scroll-track]');
  if (arrow) { document.getElementById(arrow.dataset.scrollTrack)?.scrollBy({ left: Number(arrow.dataset.direction) * 300, behavior: 'smooth' }); return; }
  const closeModal = event.target.closest('[data-close-modal]');
  if (closeModal) { closeOverlays(); return; }
  const closeMenu = event.target.closest('[data-close-menu]');
  if (closeMenu) { menuDrawer.hidden = true; document.body.classList.remove('modal-open'); return; }
  const game = event.target.closest('[data-game]');
  if (game) { showAuth('signup'); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'deposit') { showAuth('signup'); return; }
  if (action === 'search') { document.querySelector('#games-title').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.querySelector('#game-search')?.focus(), 350); return; }
  if (action === 'mode') {
    activeMode = activeMode === 'casino' ? 'sports' : 'casino';
    const sportsActive = activeMode === 'sports';
    document.body.dataset.mode = activeMode;
    document.querySelector('#mode-icon').textContent = sportsActive ? '♠' : '⚽';
    document.querySelector('#mode-label').textContent = sportsActive ? 'Casino' : 'Sport';
    event.target.closest('[data-action="mode"]').setAttribute('aria-label', `Switch to ${sportsActive ? 'casino' : 'sportsbook'} mode`);
    document.querySelector('#hero-title').innerHTML = sportsActive ? 'Find your next match.<br /><span>Back your pick.</span>' : 'Play brighter.<br /><span>Win your way.</span>';
    document.querySelector('#hero-copy').textContent = sportsActive ? 'Follow the action across live matches, leagues and your favorite sports.' : 'Find your next favorite game, explore live tables and join the action.';
    document.querySelector('#games-title').textContent = sportsActive ? 'Sportsbook' : 'Popular games';
    renderGameGroups(sportsActive ? sportsGroups : gameGroups);
    showToast(sportsActive ? 'Sports mode selected' : 'Casino mode selected');
    return;
  }
  if (action === 'menu') { menuDrawer.hidden = false; document.body.classList.add('modal-open'); }
});

document.querySelector('#auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  closeOverlays();
  showToast('Thanks! Account access is not connected in this preview.');
});