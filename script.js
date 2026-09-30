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
    { name: 'Goal Rush', type: 'Sportsbook', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=500&q=85', color: 'green' },
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
  ...casinoArt(['Goal Rush', 'Match Point', 'Final Whistle', 'Court Kings', 'Race Day', 'Pro League', 'Stadium Stars', 'Overtime', 'Fast Break', 'Victory Lap'], 'Sportsbook', ['green', 'blue', 'orange', 'purple', 'pink'], ['★', '1', 'VS', 'GO', 'W']),
  ...casinoArt(['nexluck Live', 'Stage Lights', 'Night Stream', 'Fan Zone', 'The Spotlight', 'Live Lounge', 'Game Night', 'On Air', 'Backstage', 'Prime Time'], 'Live streams', ['purple', 'pink', 'blue', 'orange', 'gold'], ['●', '▶', 'LIVE', '✦', 'ON']),
  ...casinoArt(['Live Roulette', 'Live Blackjack', 'VIP Baccarat', 'Neon Dice', 'Speed Roulette', 'Royal Live', 'Lucky 21', 'Diamond Room', 'Croupier Club', 'Infinite Spin'], 'Live casino', ['gold', 'red', 'blue', 'pink', 'purple'], ['0', '21', 'B', '7', '♠']),
];

const api = { async getAppData() { try { const response = await fetch('/api/home'); if (!response.ok) throw new Error('Prototype API unavailable'); return response.json(); } catch { await new Promise((resolve) => setTimeout(resolve, 280)); return fallbackData; } } };

function Logo({ onClick }) {
  return <button className="logo-button" onClick={onClick} aria-label="Go to nexluck home"><span className="bird-logo"><i /><b /></span><span className="logo-copy">nex<span>luck</span></span></button>;
}

function Header({ onHome, onDeposit, isAuthenticated, onLogin, onRegister, onProfile, onBonus, onNotify, balance = '$1,248.60', currency = 'USD' }) {
  return <header className={`app-header ${isAuthenticated ? 'authenticated-header' : 'guest-header'}`}><Logo onClick={onHome} />{isAuthenticated ? <div className="header-actions"><button className="header-balance" onClick={onDeposit}><small>Balance</small><strong>{balance}</strong><span>{currency}⌄</span></button><button className="header-icon-button bonus-notice" aria-label="Bonus notifications" title="Bonus notifications" onClick={onBonus}>%</button><button className="header-icon-button" aria-label="System notifications" title="System notifications" onClick={onNotify}>♧<i /></button><button className="nick-chip" aria-label="Open profile" onClick={onProfile}><span className="avatar-dot">L</span><span className="nick-name">luna.play</span><span className="loyalty-level">GOLD</span></button></div> : <div className="header-actions"><button className="header-login" onClick={onLogin}>Log in</button><button className="deposit-button" onClick={onRegister}>Sign up</button></div>}</header>;
}

function LiveWins({ wins, title = 'LIVE WINS', detail = 'won just now' }) {
  const [active, setActive] = useState(0);
  useEffect(() => { const timer = setInterval(() => setActive((current) => (current + 1) % wins.length), 2400); return () => clearInterval(timer); }, [wins.length]);
  const win = wins[active];
  return <div className="live-wins"><span className="pulse-dot" /><span className="live-label">{title}</span><span className="win-name">{win[0]}</span><strong>{win[1]}</strong><span className="win-currency">{win[2]}</span><span className="win-game">{detail}</span></div>;
}

function PromoCard({ kind, title, body, button, image, onAction }) {
  return <article className={`promo-card ${kind}`} style={{ backgroundImage: `linear-gradient(90deg, rgba(7,15,51,.92) 0%, rgba(7,15,51,.58) 52%, rgba(7,15,51,.06) 100%), url(${image})` }}><div className="promo-copy"><span className="promo-tag">{kind === 'deposit' ? 'BOOST YOUR BALANCE' : kind === 'trend' ? 'TRENDING NOW' : 'TOURNAMENTS'}</span><h2>{title}</h2><p>{body}</p>{button && <button className="color-button" onClick={onAction}>{button}</button>}</div></article>;
}

const quickCategories = [['✦', 'Slots'], ['♠', 'Table games'], ['●', 'Live casino'], ['⚽', 'Sportsbook'], ['▶', 'Live games'], ['♛', 'Tournaments']];
const sportsbookMatches = [
  { league: 'UEFA Champions League', home: 'Northbridge FC', away: 'Real Madrid', time: 'Today · 20:00', odds: ['2.45', '3.20', '2.75'] },
  { league: 'Premier League', home: 'Manchester City', away: 'Arsenal', time: 'Today · 18:30', odds: ['1.92', '3.60', '3.90'] },
];
const gameProviders = [
  { name: 'Pragmatic Play', games: '248 games', accent: 'blue' }, { name: 'Play’n GO', games: '176 games', accent: 'pink' },
  { name: 'Evolution', games: '96 live tables', accent: 'gold' }, { name: 'Relax Gaming', games: '132 games', accent: 'green' },
];

function QuickCategoryRail({ onSelect }) {
  return <section className="quick-categories"><div className="section-title"><h2>Jump into a game</h2><span className="category-caption">QUICK ACCESS</span></div><div className="quick-category-list">{quickCategories.map(([icon, label]) => <button key={label} onClick={() => onSelect(label)}><span>{icon}</span>{label}</button>)}</div></section>;
}

function SportsbookPreview({ onOpen }) {
  return <section className="sports-preview"><div className="section-title"><h2>Popular matches</h2><button onClick={onOpen}>Open sportsbook <span>→</span></button></div>{sportsbookMatches.map((match) => <article className="match-row" key={match.home}><div className="match-info"><span>{match.league} · {match.time}</span><strong>{match.home} <i>vs</i> {match.away}</strong></div><div className="match-odds">{match.odds.map((odd, index) => <button key={odd} onClick={onOpen}><small>{['1', 'X', '2'][index]}</small>{odd}</button>)}</div></article>)}</section>;
}

function ProviderRail({ onOpen }) {
  return <section className="provider-section"><div className="section-title"><h2>Game providers</h2><button onClick={onOpen}>All providers <span>→</span></button></div><div className="provider-rail">{gameProviders.map((provider) => <button className={`provider-tile ${provider.accent}`} onClick={onOpen} key={provider.name}><strong>{provider.name}</strong><span>{provider.games}</span><i>→</i></button>)}</div></section>;
}

function PromoHighlights({ onDeposit, onPromotions }) {
  return <section className="promo-highlights"><div className="section-title"><h2>Promotions</h2><button onClick={onPromotions}>View all <span>→</span></button></div><div className="promo-highlight-grid"><article><span>WELCOME OFFER</span><h3>777% + 777 free spins</h3><p>A bigger start for your next session.</p><button onClick={onDeposit}>Claim offer →</button></article><article><span>WEEKLY REWARDS</span><h3>Cashback up to 12%</h3><p>More play, more reasons to come back.</p><button onClick={onPromotions}>See details →</button></article></div></section>;
}

function FeatureTiles({ onOpen }) {
  return <section className="feature-tiles"><article className="spin-rally-tile"><span className="promo-tag">DAILY RACE</span><h2>Spin Rally</h2><p>Make every spin count. Climb the leaderboard and race for rewards.</p><button className="color-button" onClick={onOpen}>Join the rally <span>→</span></button></article><article className="loot-box-tile"><span className="promo-tag">A SURPRISE INSIDE</span><h2>Loot Box</h2><p>Open your next reward and see what luck has in store.</p><button className="outline-button" onClick={onOpen}>Explore rewards <span>→</span></button></article></section>;
}

function HomeScreen({ data, onDeposit, onNavigate }) {
  const openGames = () => onNavigate('play');
  const tournamentWinners = [['AceRunner', '$2,400.00', 'USD'], ['MilaV', '€850.00', 'EUR'], ['LuckyFox', '$520.00', 'USD']];
  return <div className="home-screen"><div className="home-welcome"><div><span className="overline">GOOD TO SEE YOU</span><h1>Ready to play, luna?</h1></div><button onClick={() => onNavigate('profile')}><span className="loyalty-star">✦</span> Gold level</button></div><LiveWins wins={data.wins} /><PromoCarousel onRegister={onDeposit} onPlay={openGames} onViewAll={() => onNavigate('promotions')} /><QuickCategoryRail onSelect={openGames} /><section className="home-games"><GameRail title="Most Popular" games={data.games} action={openGames} showOnline /><GameRail title="New games" games={data.games} action={openGames} showOnline /><GameRail title="Live casino" games={data.games} action={openGames} showOnline /></section><SportsbookPreview onOpen={() => onNavigate('sports')} /><ProviderRail onOpen={openGames} /><PromoHighlights onDeposit={onDeposit} onPromotions={() => onNavigate('promotions')} /><section className="home-tournaments"><div className="section-title"><h2>Tournaments</h2><button onClick={() => onNavigate('tournaments')}>View all <span>→</span></button></div><div className="tournament-list">{data.tournaments.map((tournament) => <TournamentCard tournament={tournament} key={tournament.name} />)}</div></section><LiveWins wins={tournamentWinners} title="TOURNAMENT PLAYERS" detail="on the leaderboard" /><FeatureTiles onOpen={() => onNavigate('tournaments')} /><CasinoFooter /></div>;
}

const guestPromotions = [
  { kind: 'deposit', title: '777% + 777 free spins', body: 'Start your casino journey with a welcome offer made to play bigger.', image: 'https://image.lukklycdn.com/catalog/39a710bd-f37b-4ead-89d4-97b5acf00756.webp' },
  { kind: 'trend', title: 'Fast, secure payouts', body: 'Enjoy convenient withdrawals and a smooth casino experience.', image: 'https://image.lukklycdn.com/catalog/09689d23-9c75-484f-85dc-eebc6d7e827d.webp' },
  { kind: 'tournament', title: 'Spooky Kabuki', body: 'Discover a new game and see what is trending now.', image: 'https://image.lukklycdn.com/catalog/a331ad79-c199-43d5-9306-dc4ce764ef27.webp' },
];

function PromoCarousel({ onRegister, onPlay, onViewAll }) {
  const [active, setActive] = useState(0);
  const promotion = guestPromotions[active];
  const move = (step) => setActive((current) => (current + step + guestPromotions.length) % guestPromotions.length);
  return <section className="promotion-section"><div className="section-title"><h2>Offers made for you</h2><button onClick={onViewAll}>View all <span>→</span></button></div><PromoCard kind={promotion.kind} title={promotion.title} body={promotion.body} button={promotion.kind === 'tournament' ? 'Explore games' : 'Join now'} image={promotion.image} onAction={promotion.kind === 'tournament' ? onPlay : onRegister} /><div className="carousel-controls"><button onClick={() => move(-1)} aria-label="Previous promotion">←</button><div>{guestPromotions.map((item, index) => <button className={active === index ? 'selected' : ''} key={item.title} onClick={() => setActive(index)} aria-label={`Show promotion ${index + 1}`} />)}</div><button onClick={() => move(1)} aria-label="Next promotion">→</button></div></section>;
}

function GuestLanding({ data, onRegister, onLogin, onPlay, onTournaments, onPromotions }) {
  return <div className="guest-home"><section className="guest-hero"><div className="guest-hero-copy"><span className="promo-tag">YOUR NEXT LUCKY MOMENT</span><h1>Play brighter.<br /><span>Win your way.</span></h1><p>Explore top casino games, live tables and tournaments. Your next favorite game is waiting.</p><button className="color-button" onClick={onRegister}>Create your account <span>→</span></button><div className="social-signup"><span>Quick sign up with</span><div><button onClick={onRegister} aria-label="Sign up with Twitch">twitch</button><button onClick={onRegister} aria-label="Sign up with Steam">steam</button><button onClick={onRegister} aria-label="Sign up with Google">G</button><button onClick={onRegister} aria-label="Sign up with Facebook">f</button></div></div></div><div className="hero-art" aria-hidden="true"><span>7</span><i>✦</i><b>♛</b></div></section><LiveWins wins={data.wins} /><section className="guest-games"><div className="section-title"><h2>Popular games</h2><button onClick={onPlay}>Explore casino <span>→</span></button></div><GameRail title="Most Popular" games={data.games} action={onPlay} /><GameRail title="New games" games={data.games} action={onPlay} /></section><PromoCarousel onRegister={onRegister} onPlay={onPlay} onViewAll={onPromotions} /><section className="guest-tournaments"><div className="section-title"><h2>Tournaments</h2><button onClick={onTournaments}>View all <span>→</span></button></div><div className="tournament-list">{data.tournaments.slice(0, 2).map((tournament) => <TournamentCard tournament={tournament} key={tournament.name} />)}</div></section><CasinoFooter /></div>;
}

function CasinoFooter() {
  return <footer className="casino-footer"><div className="footer-brand"><Logo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><span>Play brighter. Play responsibly.</span></div><p className="seo-copy">Discover online slots, live casino tables, sportsbook matches and tournaments at nexluck. Browse popular games, explore new releases and find current casino promotions in one place.</p><p>18+ only. Gambling should be fun, not a way to make money. Set limits and play responsibly.</p><nav><a id="terms" href="#terms">Terms and Conditions</a><a id="privacy" href="#privacy">Privacy</a><a id="responsible-gaming" href="#responsible-gaming">Responsible gaming</a></nav><div className="license-row"><span>LICENSE & OPERATOR DETAILS</span><span>See Terms and Conditions for regulatory information</span></div><div className="awards-row"><span>Awards and industry recognition</span><span>18+ · Secure play · Fair games</span></div><small>© 2026 nexluck. All rights reserved.</small></footer>;
}

function AuthDialog({ mode, onClose, onSuccess, onModeChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="auth-close" onClick={onClose} aria-label="Close">×</button><Logo onClick={onClose} /><span className="overline">WELCOME TO NEXLUCK</span><h2 id="auth-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p>{mode === 'register' ? 'Join the games, offers and tournaments.' : 'Log in to continue playing.'}</p><form onSubmit={(event) => { event.preventDefault(); onSuccess(); }}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="6" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label><button className="color-button auth-submit" type="submit">{mode === 'register' ? 'Sign up' : 'Log in'} <span>→</span></button></form><div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to nexluck?'} <button onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Log in' : 'Sign up'}</button></div><small className="auth-terms">By continuing, you agree to our Terms and Conditions. 18+ only.</small></section></div>;
}

function GameRail({ title, games, action, showOnline = false }) {
  const items = games.filter((game) => game.type === title);
  return <section className="game-section"><div className="section-title"><h2>{title}</h2>{action && <button onClick={action}>See all <span>→</span></button>}</div><div className="game-rail">{items.map((game, index) => <button className={`game-tile ${game.color}`} key={game.name} onClick={() => window.alert(`${game.name} is ready to play in the prototype.`)}><span className="game-art" style={{ backgroundImage: `linear-gradient(135deg, rgba(12,15,55,.08), rgba(8,12,45,.62)), url(${game.image})` }}></span><strong>{game.name}</strong><small>{showOnline ? `${(index + 2) * 384} playing` : game.type}</small></button>)}</div></section>;
}

function PlayScreen({ games }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => games.filter((game) => game.name.toLowerCase().includes(query.toLowerCase())), [games, query]);
  return <div className="play-screen"><div className="screen-heading"><div><span className="overline">THE LOBBY</span><h1>Play brighter.</h1></div><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a game" aria-label="Find a game" /></div></div><div className="category-pills"><button className="selected">All</button><button>Most Popular</button><button>New games <b>+15</b></button><button>Table games</button><button>Sportsbook</button><button>Live streams</button><button>Live casino</button></div><GameRail title="Most Popular" games={visible} action={() => setQuery('')} /><GameRail title="New games" games={visible} /><GameRail title="Table games" games={visible} /><GameRail title="Sportsbook" games={visible} /><GameRail title="Live streams" games={visible} /><GameRail title="Live casino" games={visible} /></div>;
}

function WalletScreen({ onDeposit }) {
  return <div className="wallet-screen"><div className="screen-heading"><div><span className="overline">YOUR MONEY</span><h1>Wallet</h1></div><span className="secure-badge">✦ Secure</span></div><section className="balance-card"><span>Separate currency balances</span><div className="currency-balances"><div><small>USD account</small><strong>$1,248.60</strong></div><div><small>EUR account</small><strong>€540.20</strong></div><div><small>GBP account</small><strong>£86.00</strong></div></div><label className="currency-select-label">Selected account<select aria-label="Select wallet currency"><option>USD</option><option>EUR</option><option>GBP</option></select></label><div className="balance-actions"><button className="color-button" onClick={onDeposit}>Top up <span>+</span></button><button className="outline-button">Withdraw <span>↗</span></button></div></section><div className="wallet-grid"><button><span className="wallet-icon pink">✦</span><b>Bonuses</b><small>$120 available</small><i>→</i></button><button><span className="wallet-icon yellow">%</span><b>Cashback</b><small>12% this week</small><i>→</i></button><button><span className="wallet-icon blue">≡</span><b>Statement</b><small>View your activity</small><i>→</i></button><button><span className="wallet-icon green">↕</span><b>Deposit history</b><small>Recent transactions</small><i>→</i></button></div></div>;
}

function TournamentCard({ tournament }) {
  return <article className="tournament-card" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,15,54,.9), rgba(5,15,54,.1)), url(${tournament.image})` }}><div><span className="overline">ENDS IN {tournament.end}</span><h2>{tournament.name}</h2><p>{tournament.prize} prize pool · {tournament.players}</p></div><button className="color-button">Join</button></article>;
}

function TournamentsScreen({ tournaments }) {
  return <div className="tournaments-screen"><div className="screen-heading"><div><span className="overline">CLIMB THE LEADERBOARD</span><h1>Tournaments</h1></div><span className="trophy">♛</span></div><div className="tournament-list">{tournaments.map((tournament) => <TournamentCard tournament={tournament} key={tournament.name} />)}</div></div>;
}

function SportsScreen({ onBet }) {
  return <div className="sports-screen"><div className="screen-heading"><div><span className="overline">LIVE ODDS · BIG MATCHES</span><h1>Sportsbook</h1></div><span className="sports-live"><i /> LIVE</span></div><div className="category-pills"><button className="selected">Popular</button><button>Football</button><button>Basketball</button><button>Tennis</button><button>Ice hockey</button></div><SportsbookPreview onOpen={onBet} /><section className="sports-promo"><span className="promo-tag">YOUR GAME, YOUR CALL</span><h2>Make the match yours</h2><p>Explore live odds and upcoming fixtures in the nexluck sportsbook.</p></section><CasinoFooter /></div>;
}

function PromotionsScreen({ onDeposit }) {
  return <div className="promotions-screen"><div className="screen-heading"><div><span className="overline">MORE REASONS TO PLAY</span><h1>Promotions</h1></div><span className="trophy">%</span></div><div className="promotion-list">{guestPromotions.map((promotion) => <PromoCard key={promotion.title} {...promotion} button="View promotion" onAction={onDeposit} />)}</div><CasinoFooter /></div>;
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

function MenuPanel({ isAuthenticated, onClose, onNavigate, onLogin, onRegister }) {
  const items = isAuthenticated ? [['profile', 'Profile'], ['wallet', 'Wallet'], ['tournaments', 'Tournaments'], ['play', 'Casino lobby']] : [['login', 'Log in'], ['register', 'Create an account'], ['play', 'Explore games']];
  return <div className="menu-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="menu-panel"><header><strong>Menu</strong><button onClick={onClose} aria-label="Close menu">×</button></header>{items.map(([route, label]) => <button className="menu-link" key={route} onClick={() => { onClose(); if (route === 'login') onLogin(); else if (route === 'register') onRegister(); else onNavigate(route); }}><span>{label}</span><i>→</i></button>)}<a href="#terms" onClick={onClose}>Terms and Conditions</a><a href="#responsible-gaming" onClick={onClose}>Responsible gaming</a><div className="menu-age">18+ · Play responsibly</div></section></div>;
}

function BottomNav({ active, onDeposit, onSearch, mode, onToggleMode, onMenu }) {
  return <nav className="bottom-nav" aria-label="Main navigation"><button className={active === 'wallet' ? 'active' : ''} onClick={onDeposit}><span>◈</span>Deposit</button><button className={active === 'play' ? 'active' : ''} onClick={onSearch}><span>⌕</span>Search</button><button className="mode-nav" onClick={onToggleMode} aria-label={`Switch to ${mode === 'casino' ? 'sports' : 'casino'}`}><span className="mode-icons"><b className={mode === 'casino' ? 'selected' : ''}>Casino</b><b className={mode === 'sports' ? 'selected' : ''}>Sports</b></span><small>Switch</small></button><button onClick={onMenu}><span>☰</span>Menu</button></nav>;
}

function App() {
  const [data, setData] = useState(fallbackData);
  const [screen, setScreen] = useState('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState('casino');
  const [chat, setChat] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => { api.getAppData().then(setData); }, []);
  const notify = (message) => { setToast(message); window.clearTimeout(window.nexluckToast); window.nexluckToast = window.setTimeout(() => setToast(''), 2400); };
  const navigate = (next) => setScreen(next);
  const openAuth = (next) => setAuthMode(next);
  const deposit = () => { if (!isAuthenticated) openAuth('register'); else { navigate('wallet'); notify('Wallet ready. Choose an amount to top up.'); } };
  const handleNavigate = (next) => { if (next === 'chat') { setChat(true); return; } navigate(next); };
  const finishAuth = () => { setIsAuthenticated(true); setAuthMode(''); setScreen('home'); notify('Welcome to nexluck.'); };
  const toggleMode = () => { const next = mode === 'casino' ? 'sports' : 'casino'; setMode(next); navigate(next === 'sports' ? 'sports' : 'home'); };
  const onBet = () => { if (isAuthenticated) notify('Match selection added to your bet slip.'); else openAuth('register'); };
  const mainContent = !isAuthenticated
    ? screen === 'play' ? <PlayScreen games={data.games} />
      : screen === 'sports' ? <SportsScreen onBet={onBet} />
        : screen === 'tournaments' ? <TournamentsScreen tournaments={data.tournaments} />
          : screen === 'promotions' ? <PromotionsScreen onDeposit={deposit} />
            : <GuestLanding data={data} onRegister={() => openAuth('register')} onLogin={() => openAuth('login')} onPlay={() => navigate('play')} onTournaments={() => navigate('tournaments')} onPromotions={() => navigate('promotions')} />
    : <>{screen === 'home' && <HomeScreen data={data} onDeposit={deposit} onNavigate={handleNavigate} />}{screen === 'play' && <PlayScreen games={data.games} />}{screen === 'wallet' && <WalletScreen onDeposit={() => notify('Choose a payment method to continue.')} />}{screen === 'tournaments' && <TournamentsScreen tournaments={data.tournaments} />}{screen === 'promotions' && <PromotionsScreen onDeposit={deposit} />}{screen === 'profile' && <ProfileScreen />}{screen === 'sports' && <SportsScreen onBet={onBet} />}</>;
  return <div className="app-shell"><Header onHome={() => { setMode('casino'); navigate('home'); }} onDeposit={deposit} isAuthenticated={isAuthenticated} onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} onProfile={() => navigate('profile')} onBonus={() => { navigate('wallet'); notify('Your bonus wallet is ready.'); }} onNotify={() => notify('You are all caught up.')} /><main className="app-content">{mainContent}</main><BottomNav active={screen} onDeposit={deposit} onSearch={() => navigate('play')} mode={mode} onToggleMode={toggleMode} onMenu={() => setMenuOpen(true)} />{authMode && <AuthDialog mode={authMode} onClose={() => setAuthMode('')} onSuccess={finishAuth} onModeChange={setAuthMode} />}{menuOpen && <MenuPanel isAuthenticated={isAuthenticated} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} />}{chat && <ChatPanel onClose={() => setChat(false)} />}<div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
