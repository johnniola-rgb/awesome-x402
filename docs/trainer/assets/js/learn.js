/* learn.js — the curriculum. Educational content only; nothing here is financial advice.
   Regulatory details were current as of September 2026 and can change — verify with your
   broker and with FINRA/SEC primary sources before acting on anything. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  TT.lessons = [
    {
      id: 'day-vs-swing', title: 'Day trading vs swing trading', level: 'Start here', mins: 6,
      html: [
        '<p>Both are short-term speculation on price. The difference is how long you hold, which changes almost everything else about the job.</p>',
        '<div style="overflow-x:auto"><table><thead><tr><th></th><th>Day trading</th><th>Swing trading</th></tr></thead><tbody>',
        '<tr><td>Hold time</td><td>Minutes to hours — flat by the close</td><td>Days to weeks</td></tr>',
        '<tr><td>Chart</td><td>1m / 5m / 15m, with the daily for context</td><td>Daily, with the weekly for context</td></tr>',
        '<tr><td>Overnight gap risk</td><td>None — that is the entire point</td><td>Yes, and your stop cannot protect you through a gap</td></tr>',
        '<tr><td>Screen time</td><td>Continuous during the session</td><td>20-30 minutes a day</td></tr>',
        '<tr><td>Trades per week</td><td>5-25+</td><td>1-5</td></tr>',
        '<tr><td>Typical stop</td><td>0.3-1.5% of price</td><td>3-8% of price</td></tr>',
        '<tr><td>Costs matter</td><td>Enormously — you pay the spread constantly</td><td>Much less per trade</td></tr>',
        '<tr><td>Main enemy</td><td>Overtrading and chop</td><td>Impatience and news gaps</td></tr>',
        '<tr><td>Fits a small account</td><td>Harder: costs and sizing bite</td><td>Easier: fewer, larger-R trades</td></tr>',
        '</tbody></table></div>',
        '<div class="callout"><strong>For a $2,000 account:</strong> swing trading is usually the more realistic starting point. A $2,000 account risking 1% has $20 per trade to work with. On a 5-minute chart with a $0.20 stop that is 100 shares — fine. But five trades a day, each paying a spread, turns a small edge into a small loss. Swing trades risk the same $20 across a larger price move, so costs are a far smaller share of the outcome.</div>',
        '<h3>What both require</h3>',
        '<ul><li><strong>A written playbook</strong> — the specific setups you take and the ones you skip.</li>',
        '<li><strong>Pre-defined risk</strong> — a stop on every trade, sized so no single loss matters.</li>',
        '<li><strong>A sample size</strong> — 100+ trades before you judge whether a strategy works. Twenty trades tells you almost nothing.</li>',
        '<li><strong>A journal</strong> — you cannot improve a process you do not record.</li></ul>'
      ].join('')
    },
    {
      id: 'odds', title: 'The honest odds (read this first)', level: 'Start here', mins: 5,
      html: [
        '<p>Every trading course shows you winners. Here is what the research actually found.</p>',
        '<ul>',
        '<li>Barber, Lee, Liu and Odean examined the <strong>complete trading records of the Taiwan Stock Exchange</strong> and found that in a typical year around <strong>1% of day traders</strong> were able to predictably and reliably earn positive abnormal returns net of fees.</li>',
        '<li>A study of <strong>Brazilian equity-futures day traders</strong> found that of those who persisted for more than 300 days, roughly <strong>97% lost money</strong>; about 1.1% earned more than the Brazilian minimum wage.</li>',
        '<li>Broader surveys of retail data put the share of day traders who lose money at <strong>at least 64%</strong>, with profitability shrinking further at the three- and five-year marks.</li>',
        '</ul>',
        '<div class="callout dngr"><strong>What that means for you.</strong> The base rate is bad. It is not bad because the market is rigged — it is bad because most participants trade without a tested edge, size too large, and quit their process at exactly the wrong moment. The three things you control (risk per trade, adherence to a playbook, and how many trades you take) are also the three things that separate the two groups.</div>',
        '<h3>Why a simulator helps — and where it lies to you</h3>',
        '<p>Replay training genuinely builds pattern recognition, and it is the only place you can be wrong 40 times without paying for it. But be clear about what a simulator cannot reproduce:</p>',
        '<ul>',
        '<li><strong>Emotional load.</strong> Paper money does not make your hands shake. The same setup feels completely different with rent on the line.</li>',
        '<li><strong>Fills.</strong> Real orders face spread, partial fills, and slippage that widens exactly when you most need out.</li>',
        '<li><strong>Liquidity.</strong> A simulator always fills you. A real market does not, especially in fast conditions.</li>',
        '<li><strong>Hindsight bias.</strong> Even in replay, you know the dataset ends somewhere. Use random start points and never re-run a session you have already seen.</li>',
        '</ul>',
        '<p class="muted small">Sources: Barber, Lee, Liu &amp; Odean, "Do Day Traders Rationally Learn About Their Ability?"; Chague, De-Losso &amp; Giovannetti, "Day Trading for a Living?" (Brazilian futures study); Financial Analysts Journal, "The Profitability of Day Traders". Figures are summarised, not quoted verbatim — read the papers.</p>'
      ].join('')
    },
    {
      id: 'mechanics', title: 'Market mechanics: orders, spreads, sessions', level: 'Foundations', mins: 8,
      html: [
        '<h3>Order types you must know</h3>',
        '<dl class="kv">',
        '<dt>Market</dt><dd>Fills immediately at whatever price is available. Guaranteed fill, no price guarantee. Dangerous in fast markets and on wide spreads.</dd>',
        '<dt>Limit</dt><dd>Fills at your price or better, or not at all. Price guarantee, no fill guarantee. The default for entries on anything but the most liquid names.</dd>',
        '<dt>Stop (stop-market)</dt><dd>Becomes a market order when the trigger price trades. Your protective stop. It guarantees exit, not price — through a gap it can fill far away.</dd>',
        '<dt>Stop-limit</dt><dd>Becomes a limit order at the trigger. Protects your price and can leave you holding a losing position that ran past your limit. Understand this trade-off before using it for protection.</dd>',
        '<dt>Trailing stop</dt><dd>Follows price by a fixed amount or percent. Useful for letting winners run without watching.</dd>',
        '<dt>Bracket / OCO</dt><dd>Entry with a stop and target attached, where filling one cancels the other. This trainer models bracket orders because they force you to define risk before entry.</dd>',
        '</dl>',
        '<h3>The spread is your first loss</h3>',
        '<p>Buy at the ask, sell at the bid. On SPY the spread is a penny; on a thin small cap it can be 1-2% of the price. Every round trip pays it. If you take 10 trades a day paying 0.1% each way, you start the day down 2% before you have been right about anything. <strong>This is the mathematical reason overtrading destroys small accounts.</strong></p>',
        '<h3>Session times (US equities, Eastern)</h3>',
        '<dl class="kv">',
        '<dt>4:00-9:30</dt><dd>Pre-market. Thin, wide spreads, but where gaps and catalysts are discovered.</dd>',
        '<dt>9:30-16:00</dt><dd>Regular session. This trainer uses regular-hours bars only.</dd>',
        '<dt>16:00-20:00</dt><dd>After hours. Earnings reactions happen here on very thin liquidity.</dd>',
        '</dl>',
        '<h3>Circuit breakers and halts</h3>',
        '<p>Individual stocks halt under the <strong>Limit Up-Limit Down (LULD)</strong> rules when they move too far too fast, typically resuming after five minutes. Market-wide circuit breakers pause all trading if the S&amp;P 500 falls 7%, 13% or 20% in a day. A halt means <em>you cannot exit</em> — halts are the reason position size matters more than stop placement.</p>',
        '<div class="callout warn"><strong>The stop-loss illusion.</strong> A stop is an instruction, not a guarantee. Gaps, halts and fast markets can fill you far past your price. Your true protection is position size — it is the only variable that works even when the market refuses to cooperate.</div>'
      ].join('')
    },
    {
      id: 'rules', title: 'Account rules: PDT (changed in 2026), cash accounts, T+1', level: 'Foundations', mins: 7,
      html: [
        '<div class="callout warn"><strong>Rules change. Verify before you rely on any of this.</strong> The summary below reflects the position as of September 2026. Confirm current requirements with your own broker and with FINRA/SEC primary sources — brokers may also apply stricter house rules than the regulatory minimum.</div>',
        '<h3>The pattern day trader rule was replaced in 2026</h3>',
        '<p>For two decades, a margin account flagged as a "pattern day trader" (four or more day trades in five business days) had to keep <strong>$25,000</strong> in equity. That framework is gone.</p>',
        '<ul>',
        '<li>The SEC approved FINRA\'s amendments to <strong>Rule 4210</strong> on <strong>14 April 2026</strong>, eliminating both the $25,000 minimum equity requirement and the "pattern day trader" designation itself.</li>',
        '<li>The rule change took effect <strong>4 June 2026</strong>, replacing the old day-trade counting regime with <strong>intraday margin requirements</strong> — buying power based on real-time intraday margin excess rather than a flat account threshold.</li>',
        '<li>The ordinary <strong>$2,000 minimum equity</strong> requirement for a margin account still applies.</li>',
        '<li>FINRA gave member firms a phase-in period running to <strong>20 October 2027</strong>, so <em>your broker may still be applying the old rules right now.</em> Ask them directly.</li>',
        '</ul>',
        '<div class="callout"><strong>What did not change:</strong> leverage still amplifies losses, a margin call still forces liquidation at the worst possible moment, and removing a capital requirement does not improve anyone\'s odds. The rule change lowered a barrier; it did not change the base rates in the previous lesson.</div>',
        '<h3>Cash accounts, T+1 and good faith violations</h3>',
        '<p>Cash accounts were never subject to the PDT rule, and they still are not. They have a different constraint: <strong>settlement</strong>. US stock trades settle <strong>T+1</strong> — one business day after the trade.</p>',
        '<ul>',
        '<li>A <strong>good faith violation (GFV)</strong> occurs when you buy with unsettled funds and then sell that position before the funds used to buy it have settled.</li>',
        '<li>A GFV stays on the account for a rolling 12 months. Typically, a third GFV within that window restricts the account to settled-cash-only trading for 90 days.</li>',
        '<li>Practically: in a cash account, your capital rotates roughly once per day. A $2,000 cash account cannot take five round trips in one session without tripping settlement rules.</li>',
        '</ul>',
        '<h3>Short selling</h3>',
        '<p>Shorting requires a margin account and a locatable borrow. Hard-to-borrow names carry borrow fees that can exceed 100% annualised, and you can be <strong>bought in</strong> (force-closed) if the lender recalls the shares. Losses on a short are theoretically unlimited because a stock can rise without bound. This trainer lets you practise shorts to teach structure, with none of those frictions modelled.</p>',
        '<h3>Taxes (US, general information only — not tax advice)</h3>',
        '<p>Short-term gains (held under a year) are taxed as ordinary income. The <strong>wash sale rule</strong> disallows a loss if you buy a substantially identical security within 30 days before or after the sale — active traders trip this constantly. "Trader tax status" and mark-to-market elections exist but have strict qualification criteria. Talk to a tax professional before assuming any of it applies to you.</p>'
      ].join('')
    },
    {
      id: 'risk', title: 'Risk math: the part that actually decides the outcome', level: 'Core skill', mins: 10,
      html: [
        '<h3>Think in R, not dollars</h3>',
        '<p><strong>R</strong> is the amount you risk on a trade — the distance from entry to stop, times share count. If you buy at $50 with a stop at $48.50 and own 100 shares, your R is $150. A trade that makes $300 is a +2R trade whether your account is $2,000 or $2,000,000. Thinking in R strips away the emotion of dollar amounts and makes results comparable.</p>',
        '<h3>Position sizing formula</h3>',
        '<div class="callout"><code>Shares = (Account × Risk%) ÷ (Entry − Stop)</code><br><span class="small muted">Then check: Shares × Entry must fit inside your buying power. On a small account this cap binds constantly — and the answer is a cheaper stock or a tighter (but still structural) stop, never a wider risk percentage.</span></div>',
        '<p>Example on a $2,000 account at 1% risk ($20): entry $50.00, stop $49.60, so risk per share is $0.40 and size is 50 shares — $2,500 of stock, which exceeds buying power. So either take 40 shares ($2,000, risking $16), or find a setup whose structure allows a smaller per-share risk.</p>',
        '<h3>Expectancy — the only number that matters long-run</h3>',
        '<div class="callout"><code>Expectancy (in R) = (Win% × Average win in R) − (Loss% × Average loss in R)</code></div>',
        '<p>A system winning 40% of the time with 2.5R winners and 1R losers has an expectancy of (0.4 × 2.5) − (0.6 × 1) = <strong>+0.4R per trade</strong>. A system winning 70% of the time with 0.5R winners and 1R losers has (0.7 × 0.5) − (0.3 × 1) = <strong>+0.05R</strong> — barely positive, and negative after costs. <em>Win rate alone tells you nothing.</em></p>',
        '<h3>The break-even win rate table</h3>',
        '<div style="overflow-x:auto"><table><thead><tr><th>Reward:Risk</th><th>Win rate needed to break even</th></tr></thead><tbody>',
        '<tr><td>0.5 : 1</td><td>67%</td></tr><tr><td>1 : 1</td><td>50%</td></tr><tr><td>1.5 : 1</td><td>40%</td></tr>',
        '<tr><td>2 : 1</td><td>33%</td></tr><tr><td>3 : 1</td><td>25%</td></tr><tr><td>5 : 1</td><td>17%</td></tr>',
        '</tbody></table></div>',
        '<p>This is why the trainer flags sub-1.5:1 trades. Taking 1:1 trades requires you to be right more than half the time, forever, while paying spreads.</p>',
        '<h3>Drawdown is not symmetric</h3>',
        '<div style="overflow-x:auto"><table><thead><tr><th>Drawdown</th><th>Gain required to recover</th></tr></thead><tbody>',
        '<tr><td>10%</td><td>11%</td></tr><tr><td>25%</td><td>33%</td></tr><tr><td>50%</td><td>100%</td></tr><tr><td>75%</td><td>300%</td></tr><tr><td>90%</td><td>900%</td></tr>',
        '</tbody></table></div>',
        '<p>At 2% risk per trade, a ten-trade losing streak — which happens to everyone — costs about 18% and needs a 22% gain to undo. At 10% risk per trade, the same streak takes 65% of the account and needs 186% to recover. <strong>The streak is not the problem; the sizing is.</strong></p>',
        '<h3>Rules worth adopting from day one</h3>',
        '<ul>',
        '<li><strong>Max risk per trade:</strong> 1% while learning (2% ceiling).</li>',
        '<li><strong>Max daily loss:</strong> 3R, or 3% of the account. Hit it and you are done for the day — no exceptions, because the trade after a 3R day is statistically your worst.</li>',
        '<li><strong>Max open risk:</strong> 2-3R across all positions at once, since correlated positions are one trade wearing several tickers.</li>',
        '<li><strong>Weekly circuit breaker:</strong> down 6R in a week means stop and review rather than "trade back".</li>',
        '</ul>'
      ].join('')
    },
    {
      id: 'structure', title: 'How to spot market structure (with examples)', level: 'Core skill', mins: 12,
      html: [
        '<p>Structure is simply the sequence of swing highs and swing lows. Everything else — trendlines, channels, order blocks, "smart money" vocabulary — is a description of that sequence. Use the <strong>Structure Lab</strong> tab to see every item below detected automatically on real charts.</p>',
        '<h3>1. Find the swing points first</h3>',
        '<p>A <strong>swing high</strong> is a bar whose high is higher than the N bars either side of it (N = 2 is a good default; larger N means fewer, more significant swings). A <strong>swing low</strong> is the mirror. Mark them and nothing else for your first pass.</p>',
        '<p class="muted small">Important: a swing point is only confirmed N bars <em>after</em> it prints. In live trading you never know the high is the high at the moment it happens — which is exactly why chasing extremes is a losing habit.</p>',
        '<h3>2. Read the sequence</h3>',
        '<ul>',
        '<li><strong>Uptrend:</strong> higher highs AND higher lows.</li>',
        '<li><strong>Downtrend:</strong> lower highs AND lower lows.</li>',
        '<li><strong>Range:</strong> anything else. Most of the time, this is what you have.</li>',
        '</ul>',
        '<h3>3. Break of Structure (BOS) vs Change of Character (CHoCH)</h3>',
        '<p>A <strong>BOS</strong> is a close beyond the prior swing in the SAME direction as the existing trend — continuation. A <strong>CHoCH</strong> is the first close beyond a swing point AGAINST the trend: the first lower low in an uptrend, or the first higher high in a downtrend. CHoCH is the earliest structural warning that control may be changing hands; BOS is confirmation that it has not.</p>',
        '<div class="callout"><strong>How to trade it:</strong> a CHoCH alone is not an entry. It is permission to start looking for entries in the new direction — typically on the retest of the level that broke.</div>',
        '<h3>4. Liquidity and stop hunts</h3>',
        '<p>Stops cluster in obvious places: just above swing highs, below swing lows, beyond the prior day high/low and around round numbers. Large orders need someone to trade against, and those stop clusters are that someone. A <strong>liquidity sweep</strong> is a wick that pierces the obvious level and closes back inside — the level was taken, the stops were filled, and price immediately reversed.</p>',
        '<p><strong>How to spot it:</strong> (a) an obvious level everyone can see; (b) a wick through it, often on a volume spike; (c) a close back inside within one to three bars. That reclaim is the signal. Your stop goes beyond the wick.</p>',
        '<h3>5. Fair value gaps / imbalances</h3>',
        '<p>Take any three consecutive bars. If bar 1\'s high is below bar 3\'s low (or bar 1\'s low is above bar 3\'s high), the middle bar moved so fast it left a price range where almost no trade occurred. That void is a <strong>fair value gap</strong>. Markets frequently return to fill these gaps before continuing, which makes them useful pullback entry zones — <em>and</em> useful targets.</p>',
        '<h3>6. Order blocks</h3>',
        '<p>The last opposing candle before a strong move that breaks structure. A bullish order block is the last down candle before an impulsive up move that takes out a prior high. It marks the price where the aggressive buyer stepped in, and it is often defended on the first retest.</p>',
        '<p class="muted small">Note on vocabulary: "order block", "fair value gap" and "liquidity sweep" come from the ICT / Smart Money Concepts framework. They are useful <em>descriptions</em> of price behaviour, and they are also heavily marketed. Treat them as another way of saying "supply zone", "gap" and "stop hunt" — concepts that predate the terminology by decades.</p>',
        '<h3>7. Ranges and the expansion that follows</h3>',
        '<p>Price spends most of its life in balance. A range with a clear top and bottom and a low ADX is a rotation environment: fade the edges, target the middle. When the range tightens — narrowing bars, a Bollinger squeeze, falling ATR — the break that follows is usually worth trading, because compression resolves into expansion.</p>',
        '<h3>8. The practical checklist before any entry</h3>',
        '<ol>',
        '<li>What is the trend on the timeframe ABOVE the one I am trading?</li>',
        '<li>Where is the nearest structural level in my direction? (That is my realistic target.)</li>',
        '<li>Where is the level that proves me wrong? (That is my stop — not a dollar amount.)</li>',
        '<li>Is the distance between those two at least 2:1 in my favour?</li>',
        '<li>Is there a liquidity pool right in front of me that will be taken first?</li>',
        '</ol>',
        '<p>If you cannot answer all five in under thirty seconds, the setup is not clear enough to risk money on.</p>'
      ].join('')
    },
    {
      id: 'session-map', title: 'The trading day, hour by hour', level: 'Day trading', mins: 6,
      html: [
        '<dl class="kv">',
        '<dt>4:00-9:30</dt><dd><strong>Pre-market.</strong> Build the watchlist: gappers with news, high relative volume, levels marked. Do not confuse thin pre-market moves with conviction.</dd>',
        '<dt>9:30-9:45</dt><dd><strong>The open.</strong> Highest volume and widest spreads of the day. Most professionals do not take a position in the first five minutes; they let the opening range form and watch which side fails.</dd>',
        '<dt>9:45-11:00</dt><dd><strong>The prime window.</strong> The opening range has meaning, VWAP has enough data to matter, and trends established here often run. Most day-trading profit is made in this hour.</dd>',
        '<dt>11:00-11:30</dt><dd><strong>First reversal window.</strong> Morning moves often exhaust here. Watch for failed continuation and divergence.</dd>',
        '<dt>11:30-13:30</dt><dd><strong>Lunch.</strong> Volume drains, ranges tighten, breakouts fail at their highest rate of the day. The single easiest way to improve a day-trading record is to stop trading this window.</dd>',
        '<dt>13:30-15:00</dt><dd><strong>Afternoon trend.</strong> Volume returns. A trend that survives lunch often extends into the close.</dd>',
        '<dt>15:00-15:45</dt><dd><strong>Power hour.</strong> Institutional rebalancing and closing orders. Fast, sometimes the cleanest trend of the day, and unforgiving of late entries.</dd>',
        '<dt>15:45-16:00</dt><dd><strong>The close.</strong> MOC/LOC imbalances distort price. No time for a thesis to work — mostly an exit window.</dd>',
        '</dl>',
        '<div class="callout"><strong>Use the trainer for this.</strong> Every intraday bar in the simulator carries its real session time. Run a session, take only trades between 9:45 and 11:00, and then run the same discipline with lunch-hour trades included. The difference in your own results is more convincing than any statistic.</div>'
      ].join('')
    },
    {
      id: 'swing', title: 'Swing trading specifics', level: 'Swing trading', mins: 7,
      html: [
        '<h3>Overnight gap risk is the whole difference</h3>',
        '<p>Your stop only works while the market is open. A stock that closes at $50 with your stop at $48 can open at $41 on news — you exit at $41, not $48. That is a 4.5R loss on a 1R trade. This single fact drives every other swing-trading rule.</p>',
        '<ul>',
        '<li><strong>Size for the gap, not the stop.</strong> Many swing traders size so that even a 2-3× stop-distance gap is survivable.</li>',
        '<li><strong>Know the earnings date before you enter.</strong> Holding through earnings is a binary event, not a trade. If you choose to hold, size it as a coin flip.</li>',
        '<li><strong>Diversify across sectors.</strong> Five semiconductor longs is one trade with five tickers on it.</li>',
        '</ul>',
        '<h3>What makes a good swing candidate</h3>',
        '<ol>',
        '<li><strong>Trend:</strong> above a rising 50-day and preferably the 200-day average (for longs).</li>',
        '<li><strong>Relative strength:</strong> it outperforms the index on up days and holds up on down days.</li>',
        '<li><strong>Structure:</strong> a clean base, flag or defined pullback — not a vertical move you are chasing.</li>',
        '<li><strong>Liquidity:</strong> average volume high enough that your order is not the market.</li>',
        '<li><strong>Catalyst or theme:</strong> optional but helpful — something that gives the move a reason to continue.</li>',
        '</ol>',
        '<h3>Management</h3>',
        '<p>Swing trades need fewer decisions, so the decisions you do make must be pre-planned: where the stop moves to break-even (often on the first close beyond +1R or a new swing structure), whether you scale out (commonly half at 2R), and what your time stop is — if the thesis has not started working in 5-10 bars, the setup has expired even if the stop has not been hit.</p>',
        '<div class="callout good"><strong>Why swing trading suits a $2,000 account:</strong> fewer trades means fewer spreads, larger price moves mean commissions and slippage are a smaller fraction of the result, and 20-30 minutes a night is compatible with having a job — which matters, because trading income should not be your first source of income while you are still learning.</div>'
      ].join('')
    },
    {
      id: 'psychology', title: 'Psychology: the failure modes', level: 'Core skill', mins: 8,
      html: [
        '<h3>The predictable ways people lose</h3>',
        '<dl class="kv">',
        '<dt>Revenge trading</dt><dd>Taking an unplanned trade immediately after a loss to "get it back". The statistically worst trade you will take all day. This is what a hard daily loss limit exists to prevent.</dd>',
        '<dt>FOMO</dt><dd>Entering after the move because watching it without you is unbearable. You buy at the point of maximum risk with the widest possible stop.</dd>',
        '<dt>Loss aversion</dt><dd>Cutting winners early and holding losers, because a small gain feels certain and a small loss feels avoidable. It produces the classic "70% win rate, negative expectancy" account.</dd>',
        '<dt>Moving the stop</dt><dd>The exact moment risk management ends. If your stop was correct at entry, it is correct now. If it was wrong at entry, the lesson is about entries, not stops.</dd>',
        '<dt>Averaging down</dt><dd>Adding to a loser to improve the average price. It converts a planned 1R loss into an unplanned 3R loss, and it works just often enough to become a habit before it ends an account.</dd>',
        '<dt>Overtrading after a win</dt><dd>Success creates an "I can\'t lose" state. Most traders give back a big winning day within the next two sessions.</dd>',
        '<dt>Outcome bias</dt><dd>Judging a decision by its result. A bad trade that wins is still a bad trade, and it is more dangerous than a loss because it reinforces the behaviour.</dd>',
        '</dl>',
        '<h3>Process versus outcome</h3>',
        '<p>Each trade lands in one of four boxes: good process/good outcome, good process/bad outcome, bad process/good outcome, bad process/bad outcome. You control only the process axis. Any edge produces long strings of good-process losses — that is what "40% win rate" means in practice. The trainer grades both axes separately for exactly this reason.</p>',
        '<h3>Practical countermeasures</h3>',
        '<ul>',
        '<li>Write the trade down BEFORE clicking: setup, entry, stop, target, size, and why. The journal field in the order ticket exists for this.</li>',
        '<li>Set a hard daily loss limit and enforce it by closing the platform.</li>',
        '<li>Take a mandatory break after two consecutive losses.</li>',
        '<li>Grade your process weekly; grade your P&amp;L monthly. Looking at P&amp;L continuously trains you to chase outcomes.</li>',
        '<li>Never increase size after a loss. Increase size only after a documented positive-expectancy sample.</li>',
        '</ul>'
      ].join('')
    },
    {
      id: 'journal', title: 'Journaling and review (the actual skill)', level: 'Core skill', mins: 6,
      html: [
        '<p>Screen time alone does not create skill — <strong>reviewed</strong> screen time does. Every trade in this trainer is logged automatically with entry, exit, MAE, MFE, R multiple, the strategy you selected and the coach\'s grade. That is the raw material; the review is the work.</p>',
        '<h3>What to record per trade</h3>',
        '<ul><li>Setup name (from your playbook) and the timeframe.</li><li>Entry, stop, target, size, and your planned R:R.</li><li>Why you took it — one sentence, written before entry.</li><li>What actually happened, including MAE and MFE.</li><li>What you would do differently, in behavioural terms ("waited for the retest"), not outcome terms ("should have held").</li></ul>',
        '<h3>The weekly review</h3>',
        '<ol>',
        '<li>Group trades by setup. Which setups have positive expectancy in YOUR hands? Most traders find one or two carry everything.</li>',
        '<li>Group by time of day. Many day traders discover their entire loss column comes from one window.</li>',
        '<li>Compare MFE to realised R. Consistently capturing under 40% of the available move is an exit problem, not an entry problem.</li>',
        '<li>Count rule violations. Track this number like a score — it is the only metric you fully control.</li>',
        '<li>Pick ONE change for next week. One. Changing five things at once means learning nothing from any of them.</li>',
        '</ol>',
        '<div class="callout"><strong>Sample size discipline.</strong> Twenty trades cannot distinguish a good strategy from a lucky one. Aim for 100 trades per setup before drawing conclusions, and never judge a strategy by its last three results.</div>'
      ].join('')
    },
    {
      id: 'routine', title: 'Preparation routine', level: 'Day trading', mins: 5,
      html: [
        '<h3>Night before (15 minutes)</h3>',
        '<ul><li>Review today\'s trades and grade the process.</li><li>Check tomorrow\'s economic calendar and any earnings in your universe.</li><li>Mark daily levels on your core tickers: prior day high/low/close, key swing levels, the 20/50/200 averages.</li></ul>',
        '<h3>Pre-market (30 minutes)</h3>',
        '<ul><li>Scan for gappers with news and relative volume above 2.</li><li>Cut the list to 3-5 names. More than that and you will trade none of them well.</li><li>For each: mark the pre-market high/low, the prior day levels, and the first level where the idea fails.</li><li>Write the plan: "If X breaks $Y on volume, I am long to $Z with a stop at $W."</li></ul>',
        '<h3>During the session</h3>',
        '<ul><li>Let the opening range form before committing.</li><li>Take only setups from your written playbook.</li><li>Log each trade as it closes, while the reasoning is fresh.</li><li>Stop at your daily loss limit or your trade-count limit — whichever comes first.</li></ul>',
        '<h3>After the close (10 minutes)</h3>',
        '<ul><li>Screenshot every entry and exit.</li><li>Grade adherence, not profit.</li><li>Note the single best and single worst decision of the day.</li></ul>'
      ].join('')
    },
    {
      id: 'mistakes', title: 'The mistakes that end accounts', level: 'Start here', mins: 5,
      html: [
        '<ol>',
        '<li><strong>No stop loss.</strong> One trade can then erase a hundred good ones.</li>',
        '<li><strong>Position sizing by feel.</strong> "It looks good" is not a size calculation.</li>',
        '<li><strong>Averaging down.</strong> Turning a planned loss into an unplanned disaster.</li>',
        '<li><strong>Moving stops away from price.</strong> The moment risk management becomes hope.</li>',
        '<li><strong>Revenge trading.</strong> Emotional size after an emotional loss.</li>',
        '<li><strong>Overtrading.</strong> Spreads and commissions on 20 trades a day beat most edges.</li>',
        '<li><strong>Trading without a playbook.</strong> If you cannot name the setup, you are gambling with extra steps.</li>',
        '<li><strong>Chasing extension.</strong> Entering 3 ATR from the mean guarantees a bad risk:reward.</li>',
        '<li><strong>Ignoring the higher timeframe.</strong> Shorting a 5-minute pullback in a raging daily uptrend.</li>',
        '<li><strong>Trading news events with full size.</strong> Spreads widen, stops jump, the "level" evaporates.</li>',
        '<li><strong>Copying alerts.</strong> You inherit the entry without the reasoning, the stop, or the exit — so you cannot manage the trade.</li>',
        '<li><strong>Scaling up after a hot streak.</strong> Variance feels like skill right up until the mean reverts.</li>',
        '<li><strong>Using money you need.</strong> Rent money cannot be traded objectively. It is not a discipline problem, it is a wiring problem.</li>',
        '<li><strong>Believing a guru\'s screenshots.</strong> Winning screenshots are free to produce and prove nothing. Audited, dated, full-account statements are the only evidence that matters — and they are rarely offered.</li>',
        '</ol>'
      ].join('')
    },
    {
      id: 'glossary', title: 'Glossary', level: 'Reference', mins: 4,
      html: (function () {
        var g = [
          ['Ask', 'The lowest price a seller will accept. You buy here with a market order.'],
          ['ATR', 'Average True Range — the typical size of a bar, used for stops and sizing.'],
          ['Bid', 'The highest price a buyer will pay. You sell here with a market order.'],
          ['Break-even stop', 'Moving a stop to entry price once a trade is sufficiently in profit.'],
          ['BOS', 'Break of Structure — price closes beyond the prior swing, continuing the trend.'],
          ['CHoCH', 'Change of Character — the first structural break against the prevailing trend.'],
          ['Consolidation', 'A period of tight, sideways price action; usually precedes expansion.'],
          ['Drawdown', 'Peak-to-trough decline in account equity.'],
          ['Expectancy', 'Average profit per trade in R. The number that determines long-run results.'],
          ['Float', 'Shares available for public trading. Low float means violent moves.'],
          ['FVG', 'Fair Value Gap — a three-bar imbalance where price moved without two-sided trade.'],
          ['Gap', 'A difference between one session\'s close and the next session\'s open.'],
          ['GFV', 'Good Faith Violation — selling a position bought with unsettled cash-account funds.'],
          ['HOD / LOD', 'High of day / low of day.'],
          ['Liquidity', 'How easily size can trade without moving price. Also, informally, clusters of resting stop orders.'],
          ['LULD', 'Limit Up-Limit Down — the volatility halt mechanism for individual stocks.'],
          ['MAE', 'Maximum Adverse Excursion — the worst unrealised loss a trade experienced.'],
          ['MFE', 'Maximum Favourable Excursion — the best unrealised gain a trade offered.'],
          ['Order block', 'The last opposing candle before an impulsive, structure-breaking move.'],
          ['PDT', 'Pattern Day Trader — the pre-2026 designation requiring $25,000 in a margin account. Eliminated by FINRA rule changes effective June 2026, with a phase-in period into 2027.'],
          ['POC', 'Point of Control — the price with the most traded volume in a profile.'],
          ['R', 'One unit of risk: the dollar distance from entry to stop, times size.'],
          ['RVOL', 'Relative volume versus the same time of day historically.'],
          ['Scaling', 'Entering or exiting a position in pieces rather than all at once.'],
          ['Slippage', 'The difference between expected and actual fill price.'],
          ['Spread', 'The gap between bid and ask — an unavoidable cost of every round trip.'],
          ['Stop hunt / sweep', 'A move through an obvious level that triggers resting stops, then reverses.'],
          ['T+1', 'Standard US stock settlement: trade date plus one business day.'],
          ['VWAP', 'Volume Weighted Average Price — the session\'s volume-weighted average.'],
          ['Wash sale', 'A disallowed tax loss when a substantially identical security is repurchased within 30 days.']
        ];
        return '<dl class="kv">' + g.map(function (x) {
          return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>';
        }).join('') + '</dl>';
      })()
    }
  ];
})(window);
