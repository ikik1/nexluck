const { useEffect, useMemo, useState } = React;

const fallbackData = {
  wins: [
    ['mira_queen', '$2,480.00', 'USD'], ['JaxOnFire', '€890.40', 'EUR'], ['luna.play', '£1,240.00', 'GBP'], ['Rico77', '$560.00', 'USD'],
  ],
  games: [
    { name: 'Neon Koi', type: 'Most Popular', image: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=500&q=85', color: 'pink' },
    { name: 'Turbo 7s', type: 'Most Popular', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=500&q=85', color: 'orange' },
    { name: 'Cosmic Reels', type: 'New games', image: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?auto=format&fit=crop&w=500&q=85', color: 'blue' },
    { name: 'Royal Cards', type: 'Table games', image: 'https://images.unsplash.com/photo-1518544889287-37a93a3f5b7c?auto=format&fit=crop&w=500&q=85', color: 'red' },
    { name: 'Goal Rush', type: 'Sportbooks', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=500&q=85', color: 'green' },
    { name: 'nexluck Live', type: 'Live streams', image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=500&q=85', color: 'purple' },
    { name: 'Live Roulette', type: 'Live casino', image: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&w=500&q=85', color: 'gold' },
  ],
  tournaments: [
    { name: 'Blue Hour', prize: '$25,000', players: '2,431 playing', end: '02h 14m', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=85' },
    { name: 'Lucky League', prize: '€12,500', players: '1,208 playing', end: '08h 42m', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=85' },
    { name: 'High Roller Run', prize: '$50,000', players: '487 playing', end: '1d 04h', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=85' },
  ],
};

const bannerArt = [
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

const casinoArt = (names, type, colors, symbols) => names.map((name, index) => ({ name, type, image: bannerArt[index % bannerArt.length], color: colors[index % colors.length], symbol: symbols[index % symbols.length] }));
fallbackData.games = [
  ...casinoArt(['Neon Koi', 'Turbo 7s', 'Cosmic Reels', 'Lucky Lanterns', 'Prize Galaxy', 'Cherry Heat', 'Golden Grid', 'Wild Orbit', 'Fortune Drop', 'Jackpot Jam'], 'Most Popular', ['pink', 'orange', 'blue', 'gold', 'purple'], ['♠', '7', '✦', '♦', '♣']),
  ...casinoArt(['Moon Mission', 'Pixel Fortune', 'Wild Bloom', 'Candy Comet', 'Rocket Riches', 'Star Catcher', 'Mystic Mint', 'Firefly Spins', 'Lucky Lab', 'Nova Vault'], 'New games', ['blue', 'pink', 'purple', 'orange', 'gold'], ['✦', '7', '♦', '♣', '★']),
  ...casinoArt(['Royal Cards', 'Blackjack Club', 'Roulette Royale', 'Diamond Poker', 'Baccarat Luxe', 'High Table', 'Velvet Dice', 'Club 21', 'Golden Wheel', 'Ace Society'], 'Table games', ['red', 'gold', 'blue', 'purple', 'pink'], ['♠', '♦', '♣', '♥', 'A']),
  ...casinoArt(['Goal Rush', 'Match Point', 'Final Whistle', 'Court Kings', 'Race Day', 'Pro League', 'Stadium Stars', 'Overtime', 'Fast Break', 'Victory Lap'], 'Sportbooks', ['green', 'blue', 'orange', 'purple', 'pink'], ['★', '1', 'VS', 'GO', 'W']),
  ...casinoArt(['nexluck Live', 'Stage Lights', 'Night Stream', 'Fan Zone', 'The Spotlight', 'Live Lounge', 'Game Night', 'On Air', 'Backstage', 'Prime Time'], 'Live streams', ['purple', 'pink', 'blue', 'orange', 'gold'], ['●', '▶', 'LIVE', '✦', 'ON']),
  ...casinoArt(['Live Roulette', 'Live Blackjack', 'VIP Baccarat', 'Neon Dice', 'Speed Roulette', 'Royal Live', 'Lucky 21', 'Diamond Room', 'Croupier Club', 'Infinite Spin'], 'Live casino', ['gold', 'red', 'blue', 'pink', 'purple'], ['0', '21', 'B', '7', '♠']),
];

const api = { async getAppData() { try { const response = await fetch('/api/home'); if (!response.ok) throw new Error('Prototype API unavailable'); return response.json(); } catch { await new Promise((resolve) => setTimeout(resolve, 280)); return fallbackData; } } };

function Logo({ onClick }) {
  return <button className="logo-button" onClick={onClick} aria-label="Go to nexluck home"><span className="bird-logo"><i /><b /></span><span className="logo-copy">nex<span>luck</span></span></button>;
}

function Header({ onHome, onDeposit }) {
  return <header className="app-header"><Logo onClick={onHome} /><div className="header-actions"><button className="nick-chip" aria-label="Gamer profile"><span className="avatar-dot">L</span><span className="nick-name">luna.play</span></button><button className="deposit-button" onClick={onDeposit}>Deposit</button></div></header>;
}

function LiveWins({ wins }) {
  const [active, setActive] = useState(0);
  useEffect(() => { const timer = setInterval(() => setActive((current) => (current + 1) % wins.length), 2400); return () => clearInterval(timer); }, [wins.length]);
  const win = wins[active];
  return <div className="live-wins"><span className="pulse-dot" /><span className="live-label">LIVE WINS</span><span className="win-name">{win[0]}</span><strong>{win[1]}</strong><span className="win-currency">{win[2]}</span><span className="win-game">won just now</span></div>;
}

function PromoCard({ kind, title, body, button, image, onAction }) {
  return <article className={`promo-card ${kind}`} style={{ backgroundImage: `linear-gradient(90deg, rgba(7,15,51,.92) 0%, rgba(7,15,51,.58) 52%, rgba(7,15,51,.06) 100%), url(${image})` }}><div className="promo-copy"><span className="promo-tag">{kind === 'deposit' ? 'BOOST YOUR BALANCE' : kind === 'trend' ? 'TRENDING NOW' : 'TOURNAMENTS'}</span><h2>{title}</h2><p>{body}</p>{button && <button className="color-button" onClick={onAction}>{button}</button>}</div></article>;
}

function HomeScreen({ data, onDeposit, onNavigate }) {
  return <div className="home-screen"><LiveWins wins={data.wins} /><section className="promo-feed" aria-label="Promotions"><PromoCard kind="deposit" title="777% + 777 FS" body="Play big with the nexluck welcome pack" button="Deposit now" image="https://image.lukklycdn.com/catalog/39a710bd-f37b-4ead-89d4-97b5acf00756.webp" onAction={onDeposit} /><PromoCard kind="trend" title="Money instantly" body="Quick payouts up to 4 hours" button="Deposit now" image="https://image.lukklycdn.com/catalog/09689d23-9c75-484f-85dc-eebc6d7e827d.webp" onAction={onDeposit} /><PromoCard kind="tournament" title="Spooky Kabuki" body="New game available now" button="Play now" image="https://image.lukklycdn.com/catalog/a331ad79-c199-43d5-9306-dc4ce764ef27.webp" onAction={() => onNavigate('play')} /></section><section className="quick-row"><button onClick={() => onNavigate('wallet')}><span>↗</span> Fast deposits</button><button onClick={() => onNavigate('tournaments')}><span>♛</span> Win prizes</button><button onClick={() => onNavigate('chat')}><span>•••</span> Get support</button></section></div>;
}

function GameRail({ title, games, action }) {
  const items = games.filter((game) => game.type === title);
  return <section className="game-section"><div className="section-title"><h2>{title}</h2>{action && <button onClick={action}>See all <span>→</span></button>}</div><div className="game-rail">{items.map((game) => <button className={`game-tile ${game.color}`} key={game.name} onClick={() => window.alert(`${game.name} is ready to play in the prototype.`)}><span className="game-art" style={{ backgroundImage: `linear-gradient(135deg, rgba(12,15,55,.08), rgba(8,12,45,.62)), url(${game.image})` }}></span><strong>{game.name}</strong><small>{game.type}</small></button>)}</div></section>;
}

function PlayScreen({ games }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => games.filter((game) => game.name.toLowerCase().includes(query.toLowerCase())), [games, query]);
  return <div className="play-screen"><div className="screen-heading"><div><span className="overline">THE LOBBY</span><h1>Play brighter.</h1></div><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game" aria-label="Find a game" /></div></div><div className="category-pills"><button className="selected">All</button><button>Most Popular</button><button>New games <b>+15</b></button><button>Table games</button><button>Sportbooks</button><button>Live streams</button><button>Live casino</button></div><GameRail title="Most Popular" games={visible} action={() => setQuery('')} /><GameRail title="New games" games={visible} /><GameRail title="Table games" games={visible} /><GameRail title="Sportbooks" games={visible} /><GameRail title="Live streams" games={visible} /><GameRail title="Live casino" games={visible} /></div>;
}

function WalletScreen({ onDeposit }) {
  return <div className="wallet-screen"><div className="screen-heading"><div><span className="overline">YOUR MONEY</span><h1>Wallet</h1></div><span className="secure-badge">✦ Secure</span></div><section className="balance-card"><span>Total balance</span><strong>$1,248<span>.60</span></strong><select aria-label="Balance currency"><option>USD</option><option>EUR</option><option>GBP</option></select><div className="balance-actions"><button className="color-button" onClick={onDeposit}>Top up <span>+</span></button><button className="outline-button">Withdraw <span>↗</span></button></div></section><div className="wallet-grid"><button><span className="wallet-icon pink">✦</span><b>Bonuses</b><small>$120 available</small><i>→</i></button><button><span className="wallet-icon yellow">%</span><b>Cashback</b><small>12% this week</small><i>→</i></button><button><span className="wallet-icon blue">≡</span><b>Statement</b><small>View your activity</small><i>→</i></button><button><span className="wallet-icon green">↕</span><b>Deposit history</b><small>Recent transactions</small><i>→</i></button></div></div>;
}

function TournamentCard({ tournament }) {
  return <article className="tournament-card" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,15,54,.9), rgba(5,15,54,.1)), url(${tournament.image})` }}><div><span className="overline">ENDS IN {tournament.end}</span><h2>{tournament.name}</h2><p>{tournament.prize} prize pool · {tournament.players}</p></div><button className="color-button">Join</button></article>;
}

function TournamentsScreen({ tournaments }) {
  return <div className="tournaments-screen"><div className="screen-heading"><div><span className="overline">CLIMB THE LEADERBOARD</span><h1>Tournaments</h1></div><span className="trophy">♛</span></div><div className="tournament-list">{tournaments.map((tournament) => <TournamentCard tournament={tournament} key={tournament.name} />)}</div></div>;
}

function ProfileScreen() {
  return <div className="profile-screen"><div className="profile-hero"><div className="profile-avatar">L<span className="badge">✦</span></div><div><span className="overline">LEVEL 18 · GOLD</span><h1>luna.play</h1><p>🇫🇮 Finland · Member since 2024</p></div><button aria-label="Edit profile">✎</button></div><div className="profile-stats"><div><strong>124</strong><span>Wins</span></div><div><strong>68%</strong><span>Win rate</span></div><div><strong>18</strong><span>Level</span></div><div><strong>$4.2k</strong><span>GTR</span></div></div><ProfileList title="Your activity" items={['Game statistics', 'Wins & losses', 'Your favourite games', 'Most profitable games']} /><ProfileList title="Account" items={['Referral link', 'Link Twitch / Steam accounts', 'Security', 'Log off']} /></div>;
}

function ProfileList({ title, items }) {
  return <section className="profile-list"><h2>{title}</h2>{items.map((item) => <button key={item}><span>{item}</span><i>→</i></button>)}</section>;
}

function ChatPanel({ onClose }) {
  const [message, setMessage] = useState('');
  return <div className="chat-overlay"><section className="chat-panel"><header><div><span className="online-dot" /> nexluck live chat</div><button onClick={onClose} aria-label="Close chat">×</button></header><div className="chat-messages"><div className="support-message"><b>nexluck support</b><p>Hey Luna! How can we help you today?</p><small>Just now</small></div><div className="chat-options"><button>Deposit question</button><button>Game issue</button><button>Something else</button></div></div><form onSubmit={(event) => { event.preventDefault(); setMessage(''); }}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message..." aria-label="Write a message" /><button aria-label="Send message">↑</button></form></section></div>;
}

function BottomNav({ active, onNavigate, onChat }) {
  const items = [['play', '⌘', 'Play'], ['wallet', '◈', 'Wallet'], ['tournaments', '♛', 'Tournaments'], ['profile', '◉', 'Profile']];
  return <nav className="bottom-nav" aria-label="App navigation">{items.map(([id, icon, label]) => <button className={active === id ? 'active' : ''} onClick={() => onNavigate(id)} key={id}><span>{icon}</span>{label}</button>)}<button onClick={onChat}><span>•••</span>Live chat</button></nav>;
}

function App() {
  const [data, setData] = useState(fallbackData);
  const [screen, setScreen] = useState('home');
  const [chat, setChat] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => { api.getAppData().then(setData); }, []);
  const notify = (message) => { setToast(message); window.clearTimeout(window.nexluckToast); window.nexluckToast = window.setTimeout(() => setToast(''), 2400); };
  const navigate = (next) => setScreen(next);
  return <div className="app-shell"><Header onHome={() => navigate('home')} onDeposit={() => { navigate('wallet'); notify('Wallet ready. Choose an amount to top up.'); }} /><main className="app-content">{screen === 'home' && <HomeScreen data={data} onDeposit={() => { navigate('wallet'); notify('Wallet ready. Choose an amount to top up.'); }} onNavigate={navigate} />}{screen === 'play' && <PlayScreen games={data.games} />}{screen === 'wallet' && <WalletScreen onDeposit={() => notify('Choose a payment method to continue.')} />}{screen === 'tournaments' && <TournamentsScreen tournaments={data.tournaments} />}{screen === 'profile' && <ProfileScreen />}</main><BottomNav active={screen} onNavigate={navigate} onChat={() => setChat(true)} />{chat && <ChatPanel onClose={() => setChat(false)} />}<div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
