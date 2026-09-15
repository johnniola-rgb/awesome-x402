/* legal.js — disclaimers, risk disclosure and terms of use.
   Displayed as a required acknowledgement on first load and as a permanent tab. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  TT.legal = {
    shortBanner: 'TRAINING SIMULATOR ONLY — no real money, no live data, no brokerage services, and nothing here is investment advice.',

    gate: [
      '<p><strong>Before you use this trainer, understand what it is and what it is not.</strong></p>',
      '<ul>',
      '<li>This is an <strong>educational simulator</strong>. All funds, orders, positions and profits are <strong>imaginary</strong>. No account is opened, no order is routed, and no money moves anywhere.</li>',
      '<li>Prices are <strong>static historical market data</strong> captured on a fixed date. They are <strong>not live quotes</strong> and must never be used to make a real trading decision.</li>',
      '<li>Nothing here is <strong>investment, financial, legal or tax advice</strong>, a recommendation, or a solicitation to buy or sell any security. The publisher is not a broker-dealer, investment adviser, or financial planner and is not acting in a fiduciary capacity toward you.</li>',
      '<li>Trading real securities involves a <strong>substantial risk of loss</strong>, including the loss of your entire investment. Most people who day trade lose money.</li>',
      '<li>Simulated results are hypothetical and have <strong>inherent limitations</strong>. Performance in a simulator does not predict real-world results.</li>',
      '<li>You are <strong>solely responsible</strong> for any decision you make with your own money. The publisher accepts <strong>no liability for any loss</strong> of any kind arising from use of this trainer.</li>',
      '</ul>'
    ].join(''),

    sections: [
      { h: '1. Educational simulation only',
        p: ['This application is a training tool built for education and practice. Every dollar figure, order, position, profit and loss displayed is <strong>simulated</strong>. No real currency, securities or assets are involved at any point.',
            'The publisher is <strong>not</strong> a registered broker-dealer, investment adviser, commodity trading advisor, futures commission merchant, or financial institution in any jurisdiction, and does not provide brokerage, custody, execution, clearing or advisory services. Using this trainer does not create an advisory, fiduciary, brokerage or client relationship of any kind.'] },

      { h: '2. Not investment advice',
        p: ['No content in this application — including strategy descriptions, checklists, coaching feedback, automated grades, pattern explanations, tool descriptions, lessons, or any generated commentary — constitutes investment advice, a recommendation, an endorsement, an offer, or a solicitation to buy or sell any security or financial instrument.',
            'Automated feedback is produced by fixed rules applied to historical price data. It is generic educational commentary, it takes no account of your financial circumstances, objectives, risk tolerance or needs, and it must not be relied upon as personalised advice. Consult a licensed financial professional before making any investment decision.'] },

      { h: '3. Market data',
        p: ['Historical price data was retrieved from a third-party market data provider and stored as a <strong>static snapshot</strong>. It is delayed, historical and non-live by design.',
            'Data is provided <strong>"as is"</strong> and <strong>"as available"</strong>, without warranty of accuracy, completeness, timeliness or fitness for any purpose. It may contain errors, omissions, adjustments or gaps. It must not be used for any real trading, valuation, reporting or decision-making purpose.',
            'Ticker symbols, company names and trademarks belong to their respective owners. Their appearance here is for illustration only and does not imply any affiliation with, sponsorship by, or endorsement from those companies or any data provider.'] },

      { h: '4. Hypothetical performance has inherent limitations',
        p: ['Simulated or hypothetical performance results have many inherent limitations. Unlike an actual performance record, simulated results do not represent actual trading and generally are prepared with the benefit of hindsight.',
            'No representation is made that any account will or is likely to achieve profits or losses similar to those shown. There are frequently sharp differences between hypothetical performance results and the actual results subsequently achieved by any particular trading program.',
            'This simulator does not fully model real-world conditions, including but not limited to: bid-ask spreads and their widening in fast markets, partial fills, order queue position, order rejections, market and stock-specific halts, liquidity constraints, borrow availability and borrow fees for short sales, margin calls, financing costs, dividends and corporate actions, platform or connectivity outages, taxes, regulatory fees, and the psychological pressure of trading actual money. Fills in this trainer are modelled against historical bars using simplifying assumptions and are more favourable and more certain than real execution.'] },

      { h: '5. Risk disclosure',
        p: ['Trading and investing in securities involves a substantial risk of loss and is not suitable for every person. You can lose some or all of your capital. Past performance — whether real, simulated or backtested — is <strong>not</strong> indicative of future results.',
            'Independent academic research consistently finds that a large majority of active day traders lose money over time, and that only a very small minority achieve consistent profitability net of costs.',
            'Leverage and margin magnify both gains and losses and can result in losses exceeding your initial deposit. Short selling carries theoretically unlimited risk. Options involve additional risks including total loss of premium and, for certain strategies, unlimited loss; before trading options, read the Options Clearing Corporation disclosure document "Characteristics and Risks of Standardized Options", which your broker is required to provide. This trainer does not simulate options trading.',
            'Never trade with money you cannot afford to lose entirely, including funds needed for living expenses, rent, debt payments or emergencies.'] },

      { h: '6. No warranty',
        p: ['This application and all of its content are provided <strong>"as is"</strong> and <strong>"as available"</strong>, without warranties of any kind, whether express, implied or statutory, including without limitation implied warranties of merchantability, fitness for a particular purpose, accuracy, non-infringement, and any warranties arising from course of dealing or usage of trade.',
            'The publisher does not warrant that the application will be uninterrupted, timely, secure or error-free, that calculations, indicators, detections or grades are free from defects, or that any defect will be corrected. Indicator and pattern calculations may differ from those used by any given charting platform or broker.'] },

      { h: '7. Limitation of liability',
        p: ['To the maximum extent permitted by applicable law, the publisher, its contributors, licensors and data providers shall <strong>not be liable for any loss or damage whatsoever</strong> — including without limitation direct, indirect, incidental, special, consequential, exemplary or punitive damages, lost profits, lost trading opportunities, lost data, or trading losses of any kind — arising out of or in connection with your use of, or inability to use, this application, whether based in contract, tort (including negligence), strict liability, statute or any other legal theory, and whether or not the publisher was advised of the possibility of such damages.',
            '<strong>You are solely and exclusively responsible for your own trading and investment decisions and for any resulting gains or losses.</strong> If you take a real-money action influenced by anything you saw in this trainer, that decision and its consequences are yours alone.',
            'Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities, so some of the above may not apply to you. In such cases liability is limited to the smallest amount permitted by applicable law.'] },

      { h: '8. Indemnification',
        p: ['You agree to indemnify, defend and hold harmless the publisher and its contributors from and against any claims, liabilities, damages, losses, costs and expenses (including reasonable legal fees) arising out of or related to your use of this application, your trading or investment decisions, or your violation of these terms or of any applicable law or regulation.'] },

      { h: '9. Educational content and regulatory information',
        p: ['Lessons, rules summaries, strategy descriptions and regulatory references are simplified for teaching and were believed accurate as of <strong>September 2026</strong>. Laws, regulations, exchange rules, broker policies, settlement cycles and margin requirements change, and they differ by jurisdiction and by firm.',
            'In particular, references to FINRA day-trading margin rules, the former pattern day trader designation, settlement cycles and cash-account violations are general summaries only. Verify all current requirements with your own broker and with primary sources such as FINRA and the SEC before relying on them.',
            'Nothing in this application is tax advice. Tax treatment of trading depends on your jurisdiction and personal circumstances; consult a qualified tax professional.'] },

      { h: '10. Your data',
        p: ['Account settings, simulated trades and journal entries are stored locally in your own browser using local storage. They are not transmitted to the publisher and are not backed up. Clearing your browser data deletes them permanently.',
            'No personal information is collected by this trainer, and no real brokerage account can be connected to it.'] },

      { h: '11. Eligibility and jurisdiction',
        p: ['This application is intended for adults of legal age in their jurisdiction and is provided for general educational use. It is not directed at any person in any jurisdiction where such distribution or use would be contrary to local law or regulation, and it is your responsibility to ensure your use complies with the laws applicable to you.',
            'Nothing here constitutes an offer or solicitation in any jurisdiction where such an offer or solicitation would be unlawful.'] },

      { h: '12. Changes',
        p: ['This application and these terms may be updated at any time without notice. Continued use after any change constitutes acceptance of the revised terms. If you do not agree with any part of these terms, stop using the application.'] }
    ],

    footer: 'Simulated trading. Historical data. Educational use only. Not investment advice. Trading real securities involves substantial risk of loss — you are solely responsible for your own decisions and for any losses you incur.'
  };
})(window);
