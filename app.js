(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  const TEAM_ID = '26';
  const TEAM_SLUG = 'sea';

  const API = {
    teamSummary: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_SLUG}`,
    schedule: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_SLUG}/schedule`,
    roster: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_SLUG}/roster`,
    standings: `https://site.api.espn.com/apis/v2/sports/football/nfl/standings`,
    injuries: `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries`,
    teamStats: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM_SLUG}/statistics`,
    news: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${TEAM_SLUG}`,
    athleteOverview: (id) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/overview`,
    recordBySeason: (yr) => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${yr}/types/2/teams/${TEAM_ID}/record`,
  };

  const DIVISIONS = {
    'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
    'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
    'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
    'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
    'NFC East': ['DAL', 'NYG', 'PHI', 'WSH'],
    'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
    'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
    'NFC West': ['ARI', 'LAR', 'SEA', 'SF'],
  };

  const POSITION_GROUP_LABELS = {
    offense: 'Offense',
    defense: 'Defense',
    specialTeam: 'Special Teams',
    injuredReserveOrOut: 'Injured Reserve / Out',
    suspended: 'Suspended',
    practiceSquad: 'Practice Squad',
  };

  const STAT_CATEGORY_WHITELIST = {
    passing: ['completions', 'passingAttempts', 'passingYards', 'passingTouchdowns', 'interceptions', 'QBRating', 'sacks'],
    rushing: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns', 'longRushing', 'fumbles'],
    receiving: ['receptions', 'receivingYards', 'yardsPerReception', 'receivingTouchdowns', 'longReception', 'receivingTargets'],
    defensive: ['totalTackles', 'sacks', 'interceptions', 'passesDefended', 'fumblesForced', 'defensiveTouchdowns'],
    defensiveInterceptions: ['interceptions', 'interceptionYards', 'interceptionTouchdowns'],
    kicking: ['fieldGoalsMade', 'fieldGoalAttempts', 'fieldGoalPct', 'longFieldGoalMade', 'extraPointsMade'],
    punting: ['punts', 'grossAvgPuntYards', 'netAvgPuntYards', 'longPunt', 'puntsInside20'],
    returning: ['kickReturns', 'kickReturnYards', 'puntReturns', 'puntReturnYards', 'yardsPerKickReturn'],
    scoring: ['totalPoints', 'totalTouchdowns'],
    general: ['fumbles', 'fumblesLost', 'gamesPlayed'],
  };

  // ---------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
    return res.json();
  }

  function statLookup(statsArray) {
    const out = {};
    (statsArray || []).forEach((s) => {
      out[s.name] = s;
      if (s.type) out[s.type] = s;
    });
    return out;
  }

  function fmtDate(iso, opts) {
    try {
      return new Date(iso).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function cardError(el, msg) {
    el.innerHTML = `<div class="error-box">Couldn't load this data: ${escapeHtml(msg)}</div>`;
  }

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------
  const state = {
    loadedTabs: new Set(),
    scheduleEvents: null,
    rosterData: null,
    standingsEntries: null, // flat list across whole league
    liveTimer: null,
  };

  // ---------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------
  function initTabs() {
    $all('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function activateTab(name) {
    $all('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $all('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
    loadTab(name);
  }

  function loadTab(name) {
    if (state.loadedTabs.has(name)) return;
    state.loadedTabs.add(name);
    const loaders = {
      overview: loadOverview,
      schedule: loadSchedule,
      standings: loadStandings,
      roster: loadRoster,
      injuries: loadInjuries,
      stats: loadTeamStats,
      history: loadHistory,
      playoffs: loadPlayoffOdds,
      fantasy: loadFantasy,
    };
    const fn = loaders[name];
    if (fn) fn().catch((e) => console.error(`[${name}]`, e));
  }

  function reloadAll() {
    const btn = $('#refreshBtn');
    btn.classList.add('spinning');
    state.loadedTabs.clear();
    const activeTab = $('.tab-btn.active')?.dataset.tab || 'overview';
    loadRecordBadge();
    loadTab(activeTab);
    setTimeout(() => btn.classList.remove('spinning'), 800);
  }

  // ---------------------------------------------------------------------
  // Shared data helpers
  // ---------------------------------------------------------------------
  async function getSchedule() {
    if (state.scheduleEvents) return state.scheduleEvents;
    // The default (no seasontype) response only includes whichever season
    // type is "current" — during preseason that means regular-season games
    // are missing entirely, so pull pre/regular/post explicitly and merge.
    const results = await Promise.allSettled([1, 2, 3].map((st) => fetchJSON(`${API.schedule}?seasontype=${st}`)));
    const events = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value.events || []);
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    state.scheduleEvents = events;
    return events;
  }

  async function getRoster() {
    if (state.rosterData) return state.rosterData;
    const j = await fetchJSON(API.roster);
    state.rosterData = j;
    return j;
  }

  async function getStandingsEntries() {
    if (state.standingsEntries) return state.standingsEntries;
    const j = await fetchJSON(API.standings);
    const entries = [];
    (j.children || []).forEach((conf) => {
      (conf.standings?.entries || []).forEach((e) => {
        entries.push({ ...e, conference: conf.name });
      });
    });
    state.standingsEntries = entries;
    return entries;
  }

  function divisionOf(abbr) {
    for (const [div, teams] of Object.entries(DIVISIONS)) {
      if (teams.includes(abbr)) return div;
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Record badge (topbar)
  // ---------------------------------------------------------------------
  async function loadRecordBadge() {
    const badge = $('#recordBadge');
    try {
      const j = await fetchJSON(API.teamSummary);
      const total = j.team?.record?.items?.find((i) => i.type === 'total');
      badge.textContent = total ? `${total.summary} · ${j.team.standingSummary || ''}`.trim().replace(/·\s*$/, '') : '--';
      if (!total || total.summary === undefined) badge.textContent = '--';
      else badge.textContent = total.summary;
    } catch (e) {
      badge.textContent = '--';
    }
  }

  // ---------------------------------------------------------------------
  // Overview tab
  // ---------------------------------------------------------------------
  async function loadOverview() {
    await Promise.all([
      renderNextGame(),
      renderRecentForm(),
      renderDivisionSnapshot(),
      renderNews(),
    ]);
  }

  function pickFeaturedGame(events) {
    const now = Date.now();
    const live = events.find((e) => e.competitions?.[0]?.status?.type?.state === 'in');
    if (live) return { event: live, mode: 'live' };
    const upcoming = events
      .filter((e) => new Date(e.date).getTime() >= now - 3 * 60 * 60 * 1000 && e.competitions?.[0]?.status?.type?.state !== 'post')
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (upcoming) return { event: upcoming, mode: 'upcoming' };
    const past = events
      .filter((e) => e.competitions?.[0]?.status?.type?.state === 'post')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (past) return { event: past, mode: 'final' };
    return null;
  }

  function teamSide(competition, wantSea) {
    const competitors = competition.competitors || [];
    return competitors.find((c) => (c.team.abbreviation === 'SEA') === wantSea);
  }

  async function renderNextGame() {
    const el = $('#nextGameCard');
    try {
      const events = await getSchedule();
      const picked = pickFeaturedGame(events);
      const ticker = $('#liveTicker');
      if (state.liveTimer) { clearInterval(state.liveTimer); state.liveTimer = null; }

      if (!picked) {
        el.innerHTML = '<h2>Next Game</h2><p class="muted">No schedule data available.</p>';
        ticker.classList.add('hidden');
        return;
      }

      const comp = picked.event.competitions[0];
      const sea = teamSide(comp, true);
      const opp = teamSide(comp, false);
      const status = comp.status || {};
      const isLive = status.type?.state === 'in';
      const isFinal = status.type?.state === 'post';

      if (isLive) {
        ticker.classList.remove('hidden');
        ticker.textContent = `LIVE: ${opp?.team?.shortDisplayName || 'Opponent'} ${opp?.score ?? ''} @ Seahawks ${sea?.score ?? ''} — ${status.type?.shortDetail || ''}`;
        if (!state.liveTimer) {
          state.liveTimer = setInterval(() => {
            state.scheduleEvents = null;
            renderNextGame();
          }, 30000);
        }
      } else {
        ticker.classList.add('hidden');
      }

      const label = isLive ? 'Live Now' : isFinal ? 'Final Result' : 'Next Game';
      const statusPillClass = isLive ? 'status-pill live' : 'status-pill';
      const statusText = isLive
        ? (status.type?.shortDetail || 'In Progress')
        : isFinal
          ? 'Final'
          : fmtTime(picked.event.date);

      const seaScore = (isLive || isFinal) ? (sea?.score ?? '-') : '';
      const oppScore = (isLive || isFinal) ? (opp?.score ?? '-') : '';
      const resultTag = isFinal
        ? (Number(sea?.score) > Number(opp?.score) ? '<span style="color:var(--green);font-weight:700;">WIN</span>' : Number(sea?.score) < Number(opp?.score) ? '<span style="color:var(--red);font-weight:700;">LOSS</span>' : '<span>TIE</span>')
        : '';

      el.innerHTML = `
        <h2>${label} ${resultTag}</h2>
        <div class="matchup">
          <div class="matchup-team">
            <img src="${opp?.team?.logo || opp?.team?.logos?.[0]?.href || ''}" alt="${escapeHtml(opp?.team?.shortDisplayName || 'Opponent')}">
            <span class="abbr">${escapeHtml(opp?.team?.abbreviation || 'OPP')}</span>
            ${oppScore !== '' ? `<span class="matchup-score">${oppScore}</span>` : ''}
          </div>
          <div class="matchup-mid">
            <span class="vs">${comp.competitors && sea?.homeAway === 'home' ? 'vs' : '@'}</span>
            <span class="${statusPillClass}">${escapeHtml(statusText)}</span>
          </div>
          <div class="matchup-team">
            <img src="${sea?.team?.logo || sea?.team?.logos?.[0]?.href || 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png'}" alt="Seahawks">
            <span class="abbr">SEA</span>
            ${seaScore !== '' ? `<span class="matchup-score">${seaScore}</span>` : ''}
          </div>
        </div>
        <div class="game-meta">
          ${escapeHtml(picked.event.name || '')}<br>
          ${escapeHtml(fmtDate(picked.event.date, { weekday: 'long', month: 'long', day: 'numeric' }))}
          ${comp.venue?.fullName ? ` &middot; ${escapeHtml(comp.venue.fullName)}` : ''}
          ${picked.event.week?.text ? ` &middot; ${escapeHtml(picked.event.week.text)}` : ''}
        </div>
      `;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  async function renderRecentForm() {
    const el = $('#recentFormCard');
    try {
      const events = await getSchedule();
      const played = events
        .filter((e) => e.competitions?.[0]?.status?.type?.state === 'post')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      if (!played.length) {
        el.innerHTML = '<h2>Recent Form</h2><p class="muted small">No completed games yet this season.</p>';
        return;
      }

      const rows = played.map((e) => {
        const comp = e.competitions[0];
        const sea = teamSide(comp, true);
        const opp = teamSide(comp, false);
        const win = Number(sea?.score) > Number(opp?.score);
        const tie = Number(sea?.score) === Number(opp?.score);
        const tag = tie ? 'T' : win ? 'W' : 'L';
        const tagColor = tie ? 'var(--grey)' : win ? 'var(--green)' : 'var(--red)';
        return `<div class="list-row">
          <div class="left">
            <span style="color:${tagColor};font-weight:800;width:18px;display:inline-block;">${tag}</span>
            <img class="team-logo-sm" src="${opp?.team?.logo || opp?.team?.logos?.[0]?.href || ''}" alt="">
            <span>${sea?.homeAway === 'home' ? 'vs' : '@'} ${escapeHtml(opp?.team?.abbreviation || '')}</span>
          </div>
          <span class="muted">${escapeHtml(sea?.score ?? '-')}&ndash;${escapeHtml(opp?.score ?? '-')}</span>
        </div>`;
      }).join('');

      el.innerHTML = `<h2>Recent Form</h2><div class="row-list">${rows}</div>`;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  async function renderDivisionSnapshot() {
    const el = $('#divisionSnapshotCard');
    try {
      const entries = await getStandingsEntries();
      const westTeams = entries.filter((e) => DIVISIONS['NFC West'].includes(e.team.abbreviation));
      const sorted = westTeams
        .map((e) => ({ e, lk: statLookup(e.stats) }))
        .sort((a, b) => (Number(b.lk.winpercent?.value) || 0) - (Number(a.lk.winpercent?.value) || 0));

      const rows = sorted.map(({ e, lk }) => `
        <div class="list-row ${e.team.abbreviation === 'SEA' ? 'highlight' : ''}" style="${e.team.abbreviation === 'SEA' ? 'background:rgba(105,190,40,0.15);' : ''}">
          <div class="left">
            <img class="team-logo-sm" src="${e.team.logos?.[0]?.href || ''}" alt="">
            <span>${escapeHtml(e.team.shortDisplayName)}</span>
          </div>
          <span class="muted">${escapeHtml(lk.total?.displayValue ?? `${lk.wins?.displayValue ?? '-'}-${lk.losses?.displayValue ?? '-'}`)}</span>
        </div>`).join('');

      el.innerHTML = `<h2>NFC West Snapshot</h2><div class="row-list">${rows}</div>`;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  async function renderNews() {
    const el = $('#newsCard');
    try {
      const j = await fetchJSON(API.news);
      const articles = (j.articles || []).slice(0, 5);
      if (!articles.length) {
        el.innerHTML = '<h2>Latest News</h2><p class="muted small">No recent articles.</p>';
        return;
      }
      const rows = articles.map((a) => `
        <div class="list-row" style="display:block;">
          <a href="${escapeHtml(a.links?.web?.href || '#')}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--text);font-weight:600;font-size:0.85rem;">${escapeHtml(a.headline)}</a>
          <div class="muted small" style="margin-top:4px;">${escapeHtml(fmtDate(a.published))}</div>
        </div>`).join('');
      el.innerHTML = `<h2>Latest News</h2><div class="row-list">${rows}</div>`;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Schedule tab
  // ---------------------------------------------------------------------
  async function loadSchedule() {
    const el = $('#scheduleList');
    try {
      const events = await getSchedule();
      $('#scheduleMeta').textContent = events[0]?.season?.year ? `${events[0].season.year} season` : '';

      const rows = events.map((e) => {
        const comp = e.competitions[0];
        const sea = teamSide(comp, true);
        const opp = teamSide(comp, false);
        const status = comp.status || {};
        const isFinal = status.type?.state === 'post';
        const isLive = status.type?.state === 'in';
        let resultHtml = fmtTime(e.date);
        let resultClass = '';
        if (isFinal) {
          const win = Number(sea?.score) > Number(opp?.score);
          const tie = Number(sea?.score) === Number(opp?.score);
          resultClass = tie ? '' : win ? 'win' : 'loss';
          resultHtml = `${tie ? 'T' : win ? 'W' : 'L'} ${sea?.score ?? ''}-${opp?.score ?? ''}`;
        } else if (isLive) {
          resultHtml = status.type?.shortDetail || 'Live';
          resultClass = 'win';
        }
        return `
          <div class="schedule-row ${isFinal ? 'played' : ''}">
            <span class="week-tag">${escapeHtml(e.week?.text || `Wk ${e.week?.number ?? ''}`)}</span>
            <span class="opp">
              <img src="${opp?.team?.logo || opp?.team?.logos?.[0]?.href || ''}" alt="">
              ${sea?.homeAway === 'home' ? 'vs' : '@'} ${escapeHtml(opp?.team?.shortDisplayName || opp?.team?.displayName || 'TBD')}
            </span>
            <span class="date-col">${escapeHtml(fmtDate(e.date))}</span>
            <span class="result ${resultClass}">${escapeHtml(resultHtml)}</span>
          </div>`;
      }).join('');

      el.innerHTML = rows || '<p class="muted">No games scheduled.</p>';
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Standings tab
  // ---------------------------------------------------------------------
  function standingsRowHtml(entry, highlight) {
    const lk = statLookup(entry.stats);
    return `<tr class="${highlight ? 'highlight' : ''}">
      <td class="team-cell"><img src="${entry.team.logos?.[0]?.href || ''}" alt="">${escapeHtml(entry.team.shortDisplayName)}</td>
      <td>${escapeHtml(lk.wins?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.losses?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.ties?.displayValue ?? '0')}</td>
      <td>${escapeHtml(lk.winpercent?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.pointsfor?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.pointsagainst?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.differential?.displayValue ?? '-')}</td>
      <td>${escapeHtml(lk.streak?.displayValue ?? '-')}</td>
    </tr>`;
  }

  const STANDINGS_HEAD = `<tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>PF</th><th>PA</th><th>DIFF</th><th>STRK</th></tr>`;

  async function loadStandings() {
    const westEl = $('#nfcWestCard');
    const wcEl = $('#nfcWildcardCard');
    const fullEl = $('#fullStandings');
    try {
      const entries = await getStandingsEntries();

      // NFC West
      const west = entries.filter((e) => DIVISIONS['NFC West'].includes(e.team.abbreviation))
        .sort((a, b) => (Number(statLookup(b.stats).winpercent?.value) || 0) - (Number(statLookup(a.stats).winpercent?.value) || 0));
      westEl.innerHTML = `<h2>NFC West</h2><div class="overflow-x"><table class="standings-table">${STANDINGS_HEAD}${west.map((e) => standingsRowHtml(e, e.team.abbreviation === 'SEA')).join('')}</table></div>`;

      // NFC Wild Card race: all NFC teams not division leader, sorted by win%, top 10
      const nfc = entries.filter((e) => e.conference?.includes('National'));
      const divLeaders = new Set();
      Object.keys(DIVISIONS).filter((d) => d.startsWith('NFC')).forEach((div) => {
        const teams = nfc.filter((e) => DIVISIONS[div].includes(e.team.abbreviation));
        const leader = teams.sort((a, b) => (Number(statLookup(b.stats).winpercent?.value) || 0) - (Number(statLookup(a.stats).winpercent?.value) || 0))[0];
        if (leader) divLeaders.add(leader.team.abbreviation);
      });
      const wildcard = nfc.filter((e) => !divLeaders.has(e.team.abbreviation))
        .sort((a, b) => (Number(statLookup(b.stats).winpercent?.value) || 0) - (Number(statLookup(a.stats).winpercent?.value) || 0))
        .slice(0, 10);
      wcEl.innerHTML = `<h2>NFC Wild Card Race</h2><div class="overflow-x"><table class="standings-table">${STANDINGS_HEAD}${wildcard.map((e) => standingsRowHtml(e, e.team.abbreviation === 'SEA')).join('')}</table></div><p class="muted small" style="margin-top:8px;">Top 7 in each conference (4 division leaders + 3 wild cards) make the playoffs.</p>`;

      // Full standings grouped by division
      const groups = Object.entries(DIVISIONS).map(([div, abbrs]) => {
        const teams = entries.filter((e) => abbrs.includes(e.team.abbreviation))
          .sort((a, b) => (Number(statLookup(b.stats).winpercent?.value) || 0) - (Number(statLookup(a.stats).winpercent?.value) || 0));
        return `<h3 style="margin:16px 0 6px;color:var(--green);font-size:0.85rem;text-transform:uppercase;">${div}</h3>
          <div class="overflow-x"><table class="standings-table">${STANDINGS_HEAD}${teams.map((e) => standingsRowHtml(e, e.team.abbreviation === 'SEA')).join('')}</table></div>`;
      }).join('');
      fullEl.innerHTML = groups;
    } catch (e) {
      cardError(westEl, e.message);
      cardError(wcEl, e.message);
      cardError(fullEl, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Roster tab
  // ---------------------------------------------------------------------
  function playerCardHtml(p) {
    const pos = p.position?.abbreviation || '';
    return `<div class="player-card" data-id="${p.id}" data-name="${escapeHtml(p.fullName)}" data-pos="${escapeHtml(pos)}" data-headshot="${escapeHtml(p.headshot?.href || '')}" data-jersey="${escapeHtml(p.jersey || '')}">
      <img src="${p.headshot?.href || 'https://a.espncdn.com/i/headshots/nophoto.png'}" alt="${escapeHtml(p.fullName)}" loading="lazy">
      <div class="p-name">${escapeHtml(p.fullName)}</div>
      <div class="p-jersey">#${escapeHtml(p.jersey || '-')} &middot; ${escapeHtml(pos)}</div>
      <div class="p-meta">${escapeHtml(p.college?.shortName || p.college?.name || '')}</div>
    </div>`;
  }

  async function loadRoster() {
    const grid = $('#rosterGrid');
    const filtersEl = $('#rosterFilters');
    try {
      const j = await getRoster();
      const groups = j.athletes || [];

      const filters = ['all', ...groups.map((g) => g.position)];
      filtersEl.innerHTML = filters.map((f) => `<button class="filter-chip ${f === 'all' ? 'active' : ''}" data-filter="${f}">${f === 'all' ? 'All' : (POSITION_GROUP_LABELS[f] || f)}</button>`).join('');

      function render(filter) {
        const items = filter === 'all'
          ? groups.flatMap((g) => g.items || [])
          : (groups.find((g) => g.position === filter)?.items || []);
        grid.innerHTML = items.map(playerCardHtml).join('') || '<p class="muted">No players in this group.</p>';
      }

      $all('.filter-chip', filtersEl).forEach((chip) => {
        chip.addEventListener('click', () => {
          $all('.filter-chip', filtersEl).forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          render(chip.dataset.filter);
        });
      });

      grid.addEventListener('click', (ev) => {
        const card = ev.target.closest('.player-card');
        if (!card) return;
        openPlayerModal(card.dataset.id, {
          name: card.dataset.name,
          pos: card.dataset.pos,
          headshot: card.dataset.headshot,
          jersey: card.dataset.jersey,
        });
      });

      render('all');
    } catch (e) {
      cardError(grid, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Injuries tab
  // ---------------------------------------------------------------------
  async function loadInjuries() {
    const el = $('#injuryList');
    try {
      const j = await fetchJSON(API.injuries);
      const teamEntry = (j.injuries || []).find((t) => t.id === TEAM_ID || t.displayName?.includes('Seahawks'));
      const list = teamEntry?.injuries || [];

      if (!list.length) {
        el.innerHTML = '<p class="muted">No injuries currently reported for Seattle.</p>';
        return;
      }

      el.innerHTML = list.map((inj) => {
        const statusClass = (inj.status || '').toLowerCase().replace(/\s+/g, '-');
        const athlete = inj.athlete || {};
        return `<div class="injury-row">
          <img src="https://a.espncdn.com/i/headshots/nfl/players/full/${athlete.id || ''}.png" alt="" onerror="this.style.visibility='hidden'">
          <div>
            <div style="font-weight:700;">${escapeHtml(athlete.displayName || 'Unknown')} ${athlete.position?.abbreviation ? `<span class="muted small">(${escapeHtml(athlete.position.abbreviation)})</span>` : ''}</div>
            <div class="injury-comment">${escapeHtml(inj.shortComment || inj.longComment || '')}</div>
            <div class="muted small">${inj.date ? escapeHtml(fmtDate(inj.date)) : ''}</div>
          </div>
          <span class="injury-status ${escapeHtml(statusClass)}">${escapeHtml(inj.status || 'Unknown')}</span>
        </div>`;
      }).join('');
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Team stats tab
  // ---------------------------------------------------------------------
  async function loadTeamStats() {
    const el = $('#statsCategories');
    try {
      const j = await fetchJSON(API.teamStats);
      const categories = j.results?.stats?.categories || [];
      $('#statsTitle').textContent = `Team Stats — ${j.results?.stats?.name || 'Current Season'}`;

      el.innerHTML = categories.map((cat) => {
        const whitelist = STAT_CATEGORY_WHITELIST[cat.name];
        const stats = whitelist
          ? whitelist.map((n) => cat.stats.find((s) => s.name === n)).filter(Boolean)
          : cat.stats.slice(0, 8);
        if (!stats.length) return '';
        return `<div class="stat-category">
          <h3>${escapeHtml(cat.displayName)}</h3>
          <div class="stat-grid">
            ${stats.map((s) => `<div class="stat-tile"><div class="val">${escapeHtml(s.displayValue)}</div><div class="lbl">${escapeHtml(s.shortDisplayName || s.displayName)}</div></div>`).join('')}
          </div>
        </div>`;
      }).join('') || '<p class="muted">No team stats available yet this season.</p>';
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // History tab
  // ---------------------------------------------------------------------
  async function loadHistory() {
    const el = $('#historyTable');
    try {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
      const results = await Promise.all(years.map(async (yr) => {
        try {
          const j = await fetchJSON(API.recordBySeason(yr));
          const total = (j.items || []).find((i) => i.type === 'total');
          if (!total) return null;
          const lk = statLookup(total.stats);
          return {
            year: yr,
            summary: total.summary,
            pct: total.value,
            ppg: lk.avgpointsfor?.displayValue,
            oppg: lk.avgpointsagainst?.displayValue,
            diff: lk.differential?.displayValue,
          };
        } catch (e) {
          return null;
        }
      }));

      const rows = results.filter(Boolean).filter((r) => r.summary && r.summary !== '0-0');
      if (!rows.length) {
        el.innerHTML = '<p class="muted">Historical records unavailable right now.</p>';
        return;
      }

      el.innerHTML = `<div class="overflow-x"><table class="history-table">
        <tr><th>Season</th><th>Record</th><th>PCT</th><th>PTS/G</th><th>OPP PTS/G</th><th>DIFF</th></tr>
        ${rows.map((r) => `<tr><td>${r.year}</td><td>${escapeHtml(r.summary)}</td><td>${r.pct != null ? r.pct.toFixed(3) : '-'}</td><td>${escapeHtml(r.ppg ?? '-')}</td><td>${escapeHtml(r.oppg ?? '-')}</td><td>${escapeHtml(r.diff ?? '-')}</td></tr>`).join('')}
      </table></div>`;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Playoff odds tab (real seeding context + labeled illustrative estimate)
  // ---------------------------------------------------------------------
  async function loadPlayoffOdds() {
    const el = $('#playoffOdds');
    $('#playoffOddsNote').textContent = 'Current playoff positioning comes straight from ESPN\'s standings. The percentage bars below are a simplified illustrative estimate based on win %, point differential and games back — not an official probability model (ESPN\'s own FPI-based odds aren\'t available through a free public endpoint).';
    try {
      const entries = await getStandingsEntries();
      const nfc = entries.filter((e) => e.conference?.includes('National'));

      const withScore = nfc.map((e) => {
        const lk = statLookup(e.stats);
        const wins = Number(lk.wins?.value) || 0;
        const losses = Number(lk.losses?.value) || 0;
        const ties = Number(lk.ties?.value) || 0;
        const gamesPlayed = wins + losses + ties;
        const diff = Number(lk.differential?.value) || 0;
        const gb = Number(lk.gamesbehind?.value) || 0;
        const seed = Number(lk.playoffseed?.value) || 99;
        // Shrink win% toward .500 with a 17-game prior so a single early-season
        // result doesn't swing the estimate wildly (e.g. going 1-0 in preseason).
        const shrunkWinPct = (wins + ties * 0.5 + 8.5) / (gamesPlayed + 17);
        const score = (shrunkWinPct - 0.5) * 200 + diff * 0.5 - gb * 6;
        const pct = Math.min(97, Math.max(3, 50 + score / 2));
        return { entry: e, lk, pct, seed };
      }).sort((a, b) => b.pct - a.pct);

      const sea = withScore.find((x) => x.entry.team.abbreviation === 'SEA');

      const summaryHtml = sea ? `
        <div class="odds-summary-grid">
          <div class="odds-summary-tile"><div class="big">${sea.seed && sea.seed < 99 ? `#${sea.seed}` : '—'}</div><div class="cap">Current NFC Seed</div></div>
          <div class="odds-summary-tile"><div class="big">${escapeHtml(sea.lk.gamesbehind?.displayValue ?? '0')}</div><div class="cap">Games Back</div></div>
          <div class="odds-summary-tile"><div class="big">${sea.pct.toFixed(0)}%</div><div class="cap">Illustrative Est.</div></div>
        </div>` : '';

      const bars = withScore.map((x) => `
        <div class="odds-bar-row">
          <span class="team-label">${x.seed < 99 ? `#${x.seed} ` : ''}${escapeHtml(x.entry.team.shortDisplayName)}</span>
          <div class="odds-bar-track"><div class="odds-bar-fill" style="width:${x.pct}%"></div></div>
          <span class="odds-bar-pct">${x.pct.toFixed(0)}%</span>
        </div>`).join('');

      el.innerHTML = `${summaryHtml}<h3 style="font-size:0.85rem;color:var(--green);text-transform:uppercase;margin-bottom:10px;">NFC Illustrative Playoff Chance</h3>${bars}`;
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Fantasy tab
  // ---------------------------------------------------------------------
  async function loadFantasy() {
    const el = $('#fantasyList');
    try {
      const j = await getRoster();
      const offense = j.athletes?.find((g) => g.position === 'offense')?.items || [];
      const skill = offense.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position?.abbreviation));

      el.innerHTML = `<div class="fantasy-header">
        <span></span><span>Player</span><span>Pos Rank</span><span class="col-owned">% Owned</span><span>Last 7d</span><span>Draft Rank</span>
      </div><div id="fantasyRows"><div class="skeleton"></div></div>`;

      const rowsEl = $('#fantasyRows');
      const results = await Promise.all(skill.map(async (p) => {
        try {
          const ov = await fetchJSON(API.athleteOverview(p.id));
          return { p, fantasy: ov.fantasy || null };
        } catch (e) {
          return { p, fantasy: null };
        }
      }));

      const withFantasy = results.filter((r) => r.fantasy);
      withFantasy.sort((a, b) => (parseFloat(b.fantasy.percentOwned) || 0) - (parseFloat(a.fantasy.percentOwned) || 0));
      withFantasy.splice(16); // keep the dashboard focused on the players fantasy managers actually care about

      if (!withFantasy.length) {
        rowsEl.innerHTML = '<p class="muted">Fantasy data isn\'t available for this roster right now (common in the off-season).</p>';
        return;
      }

      rowsEl.innerHTML = withFantasy.map(({ p, fantasy }) => `
        <div class="fantasy-row" data-id="${p.id}" data-name="${escapeHtml(p.fullName)}" data-pos="${escapeHtml(p.position?.abbreviation || '')}" data-headshot="${escapeHtml(p.headshot?.href || '')}" data-jersey="${escapeHtml(p.jersey || '')}">
          <img src="${p.headshot?.href || ''}" alt="">
          <span style="font-weight:700;">${escapeHtml(p.fullName)} <span class="muted small">${escapeHtml(p.position?.abbreviation || '')}</span></span>
          <span>${escapeHtml(fantasy.positionRank ? '#' + fantasy.positionRank : '-')}</span>
          <span class="col-owned">${escapeHtml(fantasy.percentOwned ? fantasy.percentOwned + '%' : '-')}</span>
          <span>${escapeHtml(fantasy.last7Days ?? '-')} pts</span>
          <span>${escapeHtml(fantasy.draftRank ? '#' + fantasy.draftRank : '-')}</span>
        </div>`).join('');

      rowsEl.addEventListener('click', (ev) => {
        const row = ev.target.closest('.fantasy-row');
        if (!row) return;
        openPlayerModal(row.dataset.id, {
          name: row.dataset.name,
          pos: row.dataset.pos,
          headshot: row.dataset.headshot,
          jersey: row.dataset.jersey,
        });
      });
    } catch (e) {
      cardError(el, e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Player modal (stats + fantasy detail, used by Roster & Fantasy tabs)
  // ---------------------------------------------------------------------
  async function openPlayerModal(id, basic) {
    const modal = $('#playerModal');
    const body = $('#modalBody');
    modal.classList.remove('hidden');
    body.innerHTML = `
      <div class="modal-header">
        <img src="${basic.headshot || ''}" alt="">
        <div>
          <h3>${escapeHtml(basic.name)}</h3>
          <div class="sub">#${escapeHtml(basic.jersey || '-')} &middot; ${escapeHtml(basic.pos || '')}</div>
        </div>
      </div>
      <div class="skeleton"></div>`;

    try {
      const ov = await fetchJSON(API.athleteOverview(id));
      const stats = ov.statistics;
      let statsHtml = '<p class="muted small">No season statistics available.</p>';
      if (stats && stats.labels && stats.splits?.length) {
        statsHtml = `<div class="overflow-x"><table class="standings-table">
          <tr><th>Split</th>${stats.labels.map((l) => `<th>${escapeHtml(l)}</th>`).join('')}</tr>
          ${stats.splits.map((sp) => `<tr><td style="text-align:left;font-weight:700;">${escapeHtml(sp.displayName)}</td>${sp.stats.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}
        </table></div>`;
      }

      let fantasyHtml = '';
      if (ov.fantasy) {
        const f = ov.fantasy;
        fantasyHtml = `
          <h3 style="margin:18px 0 10px;font-size:0.9rem;color:var(--green);text-transform:uppercase;">Fantasy Outlook</h3>
          <div class="stat-grid">
            ${f.positionRank ? `<div class="stat-tile"><div class="val">#${escapeHtml(f.positionRank)}</div><div class="lbl">Position Rank</div></div>` : ''}
            ${f.percentOwned ? `<div class="stat-tile"><div class="val">${escapeHtml(f.percentOwned)}%</div><div class="lbl">% Owned</div></div>` : ''}
            ${f.last7Days ? `<div class="stat-tile"><div class="val">${escapeHtml(f.last7Days)}</div><div class="lbl">Last 7 Days Pts</div></div>` : ''}
            ${f.draftRank ? `<div class="stat-tile"><div class="val">#${escapeHtml(f.draftRank)}</div><div class="lbl">Draft Rank</div></div>` : ''}
          </div>
          ${f.projection ? `<p class="muted small" style="margin-top:12px;line-height:1.5;">${escapeHtml(f.projection)}</p>` : ''}
        `;
      }

      body.innerHTML = `
        <div class="modal-header">
          <img src="${basic.headshot || ''}" alt="">
          <div>
            <h3>${escapeHtml(basic.name)}</h3>
            <div class="sub">#${escapeHtml(basic.jersey || '-')} &middot; ${escapeHtml(basic.pos || '')}</div>
          </div>
        </div>
        <h3 style="margin-bottom:10px;font-size:0.9rem;color:var(--green);text-transform:uppercase;">${escapeHtml(stats?.displayName || 'Season Stats')}</h3>
        ${statsHtml}
        ${fantasyHtml}
        <p style="margin-top:16px;"><a href="https://www.espn.com/nfl/player/_/id/${id}" target="_blank" rel="noopener">View full profile on ESPN &rarr;</a></p>
      `;
    } catch (e) {
      body.innerHTML += `<div class="error-box">Couldn't load player details: ${escapeHtml(e.message)}</div>`;
    }
  }

  function initModal() {
    const modal = $('#playerModal');
    $('#modalClose').addEventListener('click', () => modal.classList.add('hidden'));
    $('.modal-backdrop', modal).addEventListener('click', () => modal.classList.add('hidden'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.add('hidden');
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    initTabs();
    initModal();
    $('#refreshBtn').addEventListener('click', reloadAll);
    $('#lastUpdated').textContent = `Loaded ${new Date().toLocaleTimeString()}`;
    setInterval(() => { $('#lastUpdated').textContent = `Loaded ${new Date().toLocaleTimeString()}`; }, 60000);
    loadRecordBadge();
    loadTab('overview');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
