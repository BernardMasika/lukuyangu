export type Lang = "sw" | "en";

/** Where units get bought, cheapest channels first. Stored in
 *  `purchases.vendor`; labels live under the `vendor.*` keys below. */
export const VENDORS = [
  "mpesa",
  "mixx",
  "airtel",
  "halopesa",
  "bank",
  "agent",
  "other",
] as const;

export type Vendor = (typeof VENDORS)[number];

const t: Record<string, { sw: string; en: string }> = {
  // Nav
  "nav.dashboard": { sw: "Dashibodi", en: "Dashboard" },
  "nav.history": { sw: "Historia", en: "History" },
  "nav.analytics": { sw: "Uchambuzi", en: "Analytics" },
  "nav.settings": { sw: "Mipangilio", en: "Settings" },

  // Dashboard
  "dashboard.title": { sw: "Luku Yangu", en: "Luku Yangu" },
  "dashboard.today": { sw: "Matumizi ya Leo", en: "Today's Usage" },
  "dashboard.avg7": { sw: "Wastani (siku 7)", en: "Avg (7 days)" },
  "dashboard.spent": { sw: "Matumizi ya Mwezi", en: "Spent This Month" },
  "dashboard.lastPurchase": { sw: "Ununuzi wa Mwisho", en: "Last Purchase" },
  "dashboard.lasted": { sw: "Ilidumu ~{days} siku", en: "Lasted ~{days} days" },
  "dashboard.lasting": { sw: "Siku {days} hadi sasa", en: "Day {days} so far" },
  "dashboard.noPurchase": { sw: "Hakuna ununuzi bado", en: "No purchases yet" },
  "dashboard.kwh": { sw: "kWh", en: "kWh" },
  "dashboard.units": { sw: "vitengo", en: "units" },
  "dashboard.days": { sw: "siku", en: "days" },

  // Quick log
  "quicklog.title": { sw: "Sajili Usomaji", en: "Log a Reading" },
  "quicklog.placeholder": { sw: "Usomaji wa mita (kWh)", en: "Meter reading (kWh)" },
  "quicklog.save": { sw: "Hifadhi", en: "Save" },
  "quicklog.saved": { sw: "Imehifadhiwa!", en: "Saved!" },
  "quicklog.undo": { sw: "Tendua", en: "Undo" },
  "quicklog.note": { sw: "Maelezo (hiari)", en: "Note (optional)" },
  "quicklog.when": { sw: "Wakati (hiari)", en: "Time (optional)" },

  // Time picker presets
  "time.now": { sw: "Sasa hivi", en: "Just now" },
  "time.30min": { sw: "Dakika 30 zilizopita", en: "30 min ago" },
  "time.1h": { sw: "Saa 1 iliyopita", en: "1 hour ago" },
  "time.2h": { sw: "Masaa 2 yaliyopita", en: "2 hours ago" },
  "time.3h": { sw: "Masaa 3 yaliyopita", en: "3 hours ago" },
  "time.6h": { sw: "Masaa 6 yaliyopita", en: "6 hours ago" },
  "time.12h": { sw: "Masaa 12 yaliyopita", en: "12 hours ago" },
  "time.yesterday": { sw: "Jana", en: "Yesterday" },
  "time.custom": { sw: "Chagua wakati...", en: "Pick a time..." },

  // Nudges
  "nudge.lowBalance": {
    sw: "~{units} vitengo vilivyobaki, vitadumu ~{days} siku kwa kiwango chako cha sasa.",
    en: "~{units} units left, lasts ~{days} days at your current rate.",
  },
  "nudge.logReminder": {
    sw: "Hujasajili leo",
    en: "You haven't logged today",
  },
  "nudge.firstReading": {
    sw: "Sajili usomaji wako wa kwanza wa mita kuanza",
    en: "Log your first meter reading to get started",
  },
  "nudge.oneReading": {
    sw: "Salio la sasa: {units} vitengo. Sajili usomaji mwingine kesho kuanza kufuatilia matumizi.",
    en: "Current balance: {units} units. Log another reading tomorrow to start tracking consumption.",
  },
  "nudge.twoReadings": {
    sw: "Umetumia {units} vitengo katika masaa {hours}. Endelea kusajili kwa mienendo ya kila wiki/mwezi.",
    en: "You used {units} units in {hours} hours. Keep logging for weekly/monthly trends.",
  },
  "nudge.burnRate": {
    sw: "Kwa matumizi yako ya sasa (~{rate} kWh/siku), vitengo {units} vilivyobaki vitadumu ~{days} siku",
    en: "At your current usage (~{rate} kWh/day), your {units} remaining units should last ~{days} days",
  },
  "nudge.noPrediction": {
    sw: "Hakuna data ya kutosha, sajili usomaji kila siku kwa siku chache kupata utabiri",
    en: "Not enough data yet, log readings daily for a few days to get predictions",
  },
  "nudge.noPurchases": {
    sw: "Sajili ununuzi wa LUKU kufuatilia matumizi",
    en: "Log a LUKU purchase to track spending",
  },

  // Purchase
  "purchase.title": { sw: "Sajili Ununuzi", en: "Log Purchase" },
  "purchase.units": { sw: "Vitengo vilivyopokelewa (kWh)", en: "Units received (kWh)" },
  "purchase.amount": { sw: "Kiasi kilicholipwa (TZS)", en: "Amount paid (TZS)" },
  "purchase.note": { sw: "Maelezo (hiari)", en: "Note (optional)" },
  "purchase.when": { sw: "Wakati (hiari, sasa kwa chaguo-msingi)", en: "Time (optional, defaults to now)" },
  "purchase.submit": { sw: "Hifadhi", en: "Save" },
  "purchase.logBtn": { sw: "Sajili Ununuzi", en: "Log a Purchase" },

  // History
  "history.title": { sw: "Historia", en: "History" },
  "history.readings": { sw: "Usomaji", en: "Readings" },
  "history.purchases": { sw: "Ununuzi", en: "Purchases" },
  "history.delete": { sw: "Futa", en: "Delete" },
  "history.edit": { sw: "Hariri", en: "Edit" },
  "history.save": { sw: "Hifadhi", en: "Save" },
  "history.cancel": { sw: "Ghairi", en: "Cancel" },
  "history.confirmDelete": { sw: "Una uhakika?", en: "Are you sure?" },
  "history.confirmDeleteMsg": {
    sw: "Kitendo hiki hakiwezi kutenduka.",
    en: "This action cannot be undone.",
  },
  "history.consumption": { sw: "Matumizi", en: "Consumption" },
  "history.lasted": { sw: "Ilidumu ~{days} siku", en: "Lasted ~{days} days" },
  "history.ongoingPurchase": { sw: "Siku {days} hadi sasa", en: "Day {days} so far" },
  "history.rate": { sw: "Kiwango", en: "Rate" },
  "history.noReadings": { sw: "Hakuna usomaji bado", en: "No readings yet" },
  "history.noPurchases": { sw: "Hakuna ununuzi bado", en: "No purchases yet" },

  // Plan (Mipango)
  "nav.plan": { sw: "Mipango", en: "Plan" },
  "plan.title": { sw: "Mipango Yangu", en: "My Plan" },
  "plan.description": {
    sw: "Panga matumizi yako ya umeme, utabiri, mahesabu, na vidokezo kulingana na data yako.",
    en: "Plan your electricity usage, predictions, calculations, and tips based on your data.",
  },
  "plan.dailyUsage": { sw: "Matumizi ya Kila Siku", en: "Your Daily Usage" },
  "plan.dailyExplain": {
    sw: "Hii inategemea usomaji {count} wa mwisho kwa siku {days}. Kadri unavyosajili mara nyingi, ndivyo utabiri unavyokuwa sahihi zaidi.",
    en: "This is based on your last {count} readings over {days} days. The more often you log, the more accurate this gets.",
  },
  "plan.dailyNeedData": {
    sw: "Sajili angalau usomaji 3 kwa siku 3 kuona matumizi yako ya kila siku. Haijalishi wakati gani, sajili tu unapoangalia mita.",
    en: "Log at least 3 readings over 3 days to see your daily usage. It doesn't matter what time, just log when you check the meter.",
  },
  "plan.howLong": { sw: "Vitengo Vitadumu Kwa Muda Gani?", en: "How Long Will My Units Last?" },
  "plan.howLongExplain": {
    sw: "Kwa {rate} kWh/siku, vitengo {units} vyako vitadumu hadi takriban {date}.",
    en: "At {rate} kWh/day, your {units} units should last until approximately {date}.",
  },
  "plan.howLongNeedData": {
    sw: "Inahitaji usomaji zaidi kutabiri hili, endelea kusajili kila siku.",
    en: "Need more readings to predict this, keep logging daily.",
  },
  "plan.calculator": { sw: "Kikokotoo cha Ununuzi", en: "Purchase Calculator" },
  "plan.iHaveTzs": { sw: "Nina TZS", en: "I have TZS" },
  "plan.iNeedDays": { sw: "Nahitaji siku", en: "I need days" },
  "plan.unitsYouGet": { sw: "Vitengo utavyopata", en: "Units you'll get" },
  "plan.daysItLasts": { sw: "Vitadumu siku", en: "That lasts" },
  "plan.unitsNeeded": { sw: "Vitengo unavyohitaji", en: "Units you need" },
  "plan.estimatedCost": { sw: "Gharama takriban", en: "Estimated cost" },
  "plan.calcExplain": {
    sw: "Kulingana na wastani wako wa TZS {rate}/kWh na matumizi ya {burn} kWh/siku.",
    en: "Based on your average rate of TZS {rate}/kWh and daily usage of {burn} kWh/day.",
  },
  "plan.calcNeedPurchase": {
    sw: "Sajili angalau ununuzi mmoja wa LUKU kufungua utabiri wa gharama.",
    en: "Log at least one purchase to unlock cost predictions.",
  },
  "plan.calcNeedBurnRate": {
    sw: "Inahitaji kiwango cha matumizi kwanza, sajili usomaji kwa siku chache.",
    en: "Need a usage rate first, log readings for a few days.",
  },
  "analytics.todayBreakdown": { sw: "Matumizi ya Leo", en: "Today's Breakdown" },
  "analytics.todayExplain": {
    sw: "Hii inaonyesha kiasi ulichotumia wakati wa kila sehemu ya leo. Sajili usomaji kwa nyakati tofauti kuona picha kamili.",
    en: "This shows how much you used during each part of today. Log readings at different times to see a fuller picture.",
  },
  "analytics.todayNeedMore": {
    sw: "Sajili usomaji mwingine baadaye leo kuona matumizi yako ya leo. Jaribu kusajili asubuhi na jioni.",
    en: "Log another reading later today to see your daily breakdown. Try logging once in the morning and once in the evening.",
  },
  "plan.tips": { sw: "Vidokezo", en: "Tips" },
  "plan.tipStart": {
    sw: "Anza kwa kusajili usomaji wa mita mara moja kwa siku, wakati wowote unafaa. Baada ya siku 3, utaanza kuona utabiri.",
    en: "Start by logging your meter reading once a day, any time works. After 3 days, you'll start seeing predictions.",
  },
  "plan.tipNoPurchase": {
    sw: "Sajili ununuzi wako wa LUKU ujao kufuatilia matumizi na gharama kwa kila kitengo.",
    en: "Log your next LUKU purchase to track spending and cost per unit.",
  },
  "plan.tipGreatLogging": {
    sw: "Unasajili vizuri sana! Utabiri wako una usahihi wa hali ya juu.",
    en: "Great logging! Your predictions are highly accurate.",
  },
  "plan.tipLogMore": {
    sw: "Jaribu kusajili angalau mara moja kwa siku kwa usahihi bora. Usomaji wa asubuhi na jioni unatoa matumizi bora ya kila siku.",
    en: "Try logging at least once a day for better accuracy. Morning and evening readings give the best daily breakdown.",
  },
  "plan.tipLogOutages": {
    sw: "Umeme ukikatika, sajili, inafanya utabiri wako wa matumizi kuwa sahihi zaidi.",
    en: "If TANESCO cuts power, log it, it makes your usage predictions more accurate.",
  },
  "plan.tipGenerator": {
    sw: "Hata kama nyumba yako ina jenereta, sajili kukatika kwa umeme. Mita ya LUKU haisomi umeme wa jenereta, kwa hivyo vitengo vyako vinadumu zaidi wakati wa kukatika, utabiri wako unajumuisha hili.",
    en: "Even if your building has a generator, still log outages. Your LUKU meter doesn't count generator power, so your units last longer during cuts, your predictions already reflect this.",
  },
  "plan.tipGeneratorReminder": {
    sw: "Kubadilisha kwa jenereta moja kwa moja kunaweza kukufanya usahau kukatika kwa TANESCO. Sajili kila wakati umeme unapokatika na kurudi ili matumizi yako yabaki sahihi.",
    en: "Auto-switching to a generator can make you forget about TANESCO outages. Always log when power goes off and comes back so your usage tracking stays accurate.",
  },
  "plan.depletionDate": { sw: "Tarehe ya kuisha", en: "Depletion date" },
  "plan.trendUp": { sw: "Matumizi yanaongezeka", en: "Usage is increasing" },
  "plan.trendDown": { sw: "Matumizi yanapungua", en: "Usage is decreasing" },
  "plan.trendSteady": { sw: "Matumizi yako ni thabiti", en: "Your usage is steady" },
  "plan.daysLabel": { sw: "siku", en: "days" },

  // Analytics
  "analytics.title": { sw: "Uchambuzi", en: "Analytics" },
  "analytics.description": {
    sw: "Angalia matumizi yako yaliyopita, mienendo, gharama, na mabadiliko yaliyotokea.",
    en: "Review your past usage, trends, costs, and changes that have already happened.",
  },
  "analytics.daily": { sw: "Kila Siku", en: "Daily" },
  "analytics.weekly": { sw: "Kila Wiki", en: "Weekly" },
  "analytics.monthly": { sw: "Kila Mwezi", en: "Monthly" },
  "analytics.cost": { sw: "Gharama", en: "Cost Summary" },
  "analytics.totalMonth": { sw: "Jumla mwezi huu", en: "Total this month" },
  "analytics.avgDay": { sw: "Wastani/siku", en: "Avg/day" },
  "analytics.avgKwh": { sw: "Wastani/kWh", en: "Avg/kWh" },
  "analytics.vsLastMonth": { sw: "vs mwezi uliopita", en: "vs last month" },
  "analytics.changes": { sw: "Mabadiliko ya Matumizi", en: "Usage Changes" },
  "analytics.steady": {
    sw: "Matumizi yako yamekuwa thabiti.",
    en: "Your consumption has been steady.",
  },
  "analytics.needData": {
    sw: "Endelea kusajili, ugunduzi wa mabadiliko utaanza baada ya wiki 5 za data.",
    en: "Keep logging, change detection starts after 5 weeks of data.",
  },
  "analytics.copySummary": { sw: "Nakili Muhtasari kwa AI", en: "Copy Summary for AI" },
  "analytics.copied": {
    sw: "Imenakiliwa! Bandika kwenye Claude, ChatGPT, au mazungumzo yoyote ya AI.",
    en: "Copied! Paste into Claude, ChatGPT, or any AI chat.",
  },
  "analytics.bar": { sw: "Grafu ya Baa", en: "Bar Chart" },
  "analytics.line": { sw: "Grafu ya Mstari", en: "Line Chart" },

  // Settings
  "settings.title": { sw: "Mipangilio", en: "Settings" },
  "settings.meterNo": { sw: "Nambari ya Mita", en: "Meter Number" },
  "settings.export": { sw: "Hamisha Data (CSV)", en: "Export Data (CSV)" },
  "settings.language": { sw: "Lugha", en: "Language" },
  "settings.theme": { sw: "Mandhari", en: "Theme" },
  "settings.dark": { sw: "Giza", en: "Dark" },
  "settings.light": { sw: "Mwanga", en: "Light" },
  "settings.saved": { sw: "Imehifadhiwa!", en: "Saved!" },

  // Install banner
  "install.title": { sw: "Sakinisha Luku Yangu", en: "Install Luku Yangu" },
  "install.message": {
    sw: "Sakinisha kwa ufikiaji wa haraka na vikumbusho vya kila siku.",
    en: "Install for quick access and daily logging reminders.",
  },
  "install.button": { sw: "Sakinisha", en: "Install" },
  "install.settingsBtn": { sw: "Sakinisha Programu", en: "Install App" },
  "install.installed": { sw: "Programu imesanikishwa", en: "App is installed" },
  "install.uninstallHint": {
    sw: "Ondoa kupitia Mipangilio ya simu > Programu > Luku Yangu",
    en: "Uninstall via phone Settings > Apps > Luku Yangu",
  },

  // Reminder
  "reminder.title": { sw: "Kumbusho la Kila Siku", en: "Daily Reminder" },
  "reminder.description": {
    sw: "Pokea kumbusho la kusajili usomaji wa mita kila siku.",
    en: "Get a daily reminder to log your meter reading.",
  },
  "reminder.time": { sw: "Wakati wa kumbusho", en: "Reminder time" },
  "reminder.enabled": { sw: "Kumbusho limewashwa", en: "Reminder enabled" },
  "reminder.disabled": { sw: "Kumbusho limezimwa", en: "Reminder disabled" },
  "reminder.permissionDenied": {
    sw: "Ruhusa ya arifa imekataliwa. Ruhusu arifa kwenye mipangilio ya kivinjari.",
    en: "Notification permission denied. Please allow notifications in browser settings.",
  },
  "reminder.notifTitle": { sw: "Luku Yangu", en: "Luku Yangu" },
  "reminder.notifBody": {
    sw: "Usisahau kusajili usomaji wako wa mita leo!",
    en: "Don't forget to log your meter reading today!",
  },

  // Time periods
  "period.alfajiri": { sw: "Alfajiri", en: "Pre-dawn" },
  "period.asubuhi": { sw: "Asubuhi", en: "Morning" },
  "period.mchana": { sw: "Mchana", en: "Afternoon" },
  "period.jioni": { sw: "Jioni", en: "Evening" },
  "period.usiku": { sw: "Usiku", en: "Night" },

  // Outages
  "outage.title": { sw: "Kukatika kwa Umeme", en: "Power Outages" },
  "outage.powerOut": { sw: "Umeme Umekatika", en: "Power is Out" },
  "outage.powerBack": { sw: "Umeme Umerudi", en: "Power is Back" },
  "outage.active": { sw: "Umeme umekatika sasa", en: "Power is currently out" },
  "outage.since": { sw: "Tangu", en: "Since" },
  "outage.whenOut": { sw: "Umeme ulikatika lini?", en: "When did power go out?" },
  "outage.duration": { sw: "Muda", en: "Duration" },
  "outage.hours": { sw: "masaa", en: "hours" },
  "outage.minutes": { sw: "dakika", en: "min" },
  "outage.totalMonth": { sw: "Jumla mwezi huu", en: "Total this month" },
  "outage.count": { sw: "Kukatika", en: "Outages" },
  "outage.avgDuration": { sw: "Wastani", en: "Average" },
  "outage.noOutages": { sw: "Hakuna kukatika bado", en: "No outages yet" },
  "outage.logPast": { sw: "Sajili kukatika kuliopita", en: "Log a past outage" },
  "outage.start": { sw: "Ilianza", en: "Started" },
  "outage.end": { sw: "Ilimalizika", en: "Ended" },
  "outage.ongoing": { sw: "Inaendelea", en: "Ongoing" },
  "history.outages": { sw: "Kukatika", en: "Outages" },
  "analytics.byPeriod": { sw: "Matumizi kwa Wakati wa Siku", en: "Usage by Time of Day" },
  "analytics.outages": { sw: "Kukatika kwa Umeme", en: "Power Outages" },
  "analytics.periodNote": {
    sw: "Kulingana na wakati usomaji uliporekodiwa",
    en: "Based on when readings were logged",
  },
  "analytics.periodToday": { sw: "Leo", en: "Today" },
  "analytics.periodAll": { sw: "Jumla", en: "All Time" },

  // Purchase vendor and activation time
  "purchase.vendor": { sw: "Ulinunua wapi?", en: "Where did you buy?" },
  "purchase.vendorHelp": {
    sw: "Wakala huuza ghali kidogo kwa kitengo kuliko M-Pesa au app ya benki. Tukijua sehemu, tunaweza kukuonyesha ipi ni nafuu.",
    en: "Agents charge a bit more per unit than M-Pesa or a bank app. If we know the source, we can show you which one is cheapest.",
  },
  "purchase.whenActivated": {
    sw: "Vitengo viliingia kwenye mita lini?",
    en: "When did the units enter the meter?",
  },
  "purchase.whenActivatedHelp": {
    sw: "Tumia wakati ulipoweka token kwenye mita, siyo wakati ulipolipa. Ndio wakati unaohesabika kwenye matumizi.",
    en: "Use the time you punched the token into the meter, not the time you paid. That is the moment the units start counting.",
  },
  "vendor.mpesa": { sw: "M-Pesa", en: "M-Pesa" },
  "vendor.mixx": { sw: "Mixx (Tigo Pesa)", en: "Mixx (Tigo Pesa)" },
  "vendor.airtel": { sw: "Airtel Money", en: "Airtel Money" },
  "vendor.halopesa": { sw: "HaloPesa", en: "HaloPesa" },
  "vendor.bank": { sw: "App ya benki", en: "Bank app" },
  "vendor.agent": { sw: "Wakala au duka", en: "Agent or shop" },
  "vendor.other": { sw: "Nyingine", en: "Other" },
  "vendor.unknown": { sw: "Haijulikani", en: "Not recorded" },

  // Dashboard, restructured
  "dashboard.balance": { sw: "Vitengo vilivyopo", en: "Units on the meter" },
  "dashboard.runsOutIn": { sw: "Vitaisha baada ya siku {days}", en: "Runs out in {days} days" },
  "dashboard.runsOutOn": { sw: "yaani {date}", en: "around {date}" },
  "dashboard.runsOutUnknown": {
    sw: "Sajili usomaji siku chache ili tujue vitaisha lini",
    en: "Log a few more readings and we can tell you when these run out",
  },
  "dashboard.inUse": { sw: "Ununuzi unaotumika", en: "Purchase in use" },
  "dashboard.dayOf": { sw: "Siku {day} kati ya takriban {total}", en: "Day {day} of about {total}" },
  "dashboard.queued": { sw: "Bado haijaanza kutumika", en: "Not in use yet" },
  "dashboard.queuedExplain": {
    sw: "Vitengo {units} vya awali vinatumika kwanza, ndipo hivi vianze.",
    en: "The earlier {units} units burn first, then this purchase starts.",
  },
  "dashboard.perDay": { sw: "TZS {tzs} kwa siku", en: "TZS {tzs} a day" },
  "dashboard.estimate": { sw: "makadirio", en: "estimate" },
  "dashboard.unitsLeftOfPurchase": {
    sw: "Vitengo {units} vimebaki kwenye ununuzi huu",
    en: "{units} units left from this purchase",
  },

  "dashboard.lowBalanceShort": {
    sw: "Vitengo vinakwisha, panga kununua",
    en: "Units are running low, plan a purchase",
  },
  "dashboard.logToday": {
    sw: "Hujasajili usomaji leo",
    en: "You have not logged a reading today",
  },

  // Mistype guard
  "guard.title": { sw: "Hakiki usomaji huu", en: "Check this reading" },
  "guard.tooHigh": {
    sw: "Umeandika {entered}, lakini mita ilikuwa {last}. Mita ya LUKU hushuka, haiwezi kupanda bila ununuzi.",
    en: "You typed {entered}, but the meter was at {last}. A LUKU meter counts down, it cannot go up without a purchase.",
  },
  "guard.tooHighAction": {
    sw: "Kama ulinunua vitengo, sajili ununuzi kwanza.",
    en: "If you bought units, log that purchase first.",
  },
  "guard.tooFast": {
    sw: "Hiyo ni kWh {used} kwa saa {hours}, karibu mara {times} ya kasi yako ya kawaida.",
    en: "That is {used} kWh in {hours} hours, about {times}x your usual rate.",
  },
  "guard.expected": { sw: "Tulitegemea karibu {expected} kWh", en: "We expected around {expected} kWh" },
  "guard.saveAnyway": { sw: "Ni sahihi, hifadhi", en: "It is correct, save it" },
  "guard.goPurchase": { sw: "Sajili ununuzi", en: "Log a purchase" },
  "guard.fix": { sw: "Rekebisha", en: "Let me fix it" },

  // Detections
  "detect.outageTitle": { sw: "Kulikuwa na kukatika kwa umeme?", en: "Was there a power cut?" },
  "detect.outageBody": {
    sw: "Kati ya {from} na {to} mita ilisogea kidogo sana, kWh {rate} kwa siku badala ya {baseline}. Labda umeme ulikatika ukiwa mbali.",
    en: "Between {from} and {to} the meter barely moved, {rate} kWh a day instead of {baseline}. Power may have been out while you were away.",
  },
  "detect.outageYes": { sw: "Ndiyo, sajili", en: "Yes, log it" },
  "detect.dismiss": { sw: "Ondoa", en: "Dismiss" },
  "detect.missingTitle": { sw: "Kuna ununuzi haukusajiliwa?", en: "Is a purchase missing?" },
  "detect.missingBody": {
    sw: "Mita ilipanda kwa takriban vitengo {units} kati ya {from} na {to}, bila ununuzi kusajiliwa.",
    en: "The meter went up by about {units} units between {from} and {to}, with no purchase recorded.",
  },
  "detect.missingAction": { sw: "Sajili ununuzi huo", en: "Log that purchase" },
  "detect.gapTitle": { sw: "Siku {days} bila kusajili", en: "{days} days without logging" },
  "detect.gapBody": {
    sw: "Kati ya {from} na {to} hukusajili usomaji. Jumla ya kWh {units} ilitumika, lakini mchanganuo wa kila siku ni makadirio.",
    en: "You logged nothing between {from} and {to}. {units} kWh went in total, but the day by day split is an estimate.",
  },
  "detect.gapPurchases": {
    sw: "Manunuzi {count} yalitokea ndani ya kipindi hicho.",
    en: "{count} purchases happened inside that stretch.",
  },
  "detect.ranOutAt": { sw: "Viliisha {when}", en: "Ran out {when}" },
  "detect.ranOutAbout": { sw: "Viliisha takriban {when}", en: "Ran out around {when}" },
  "detect.ranOutWindow": {
    sw: "Hujasajili usomaji wakati huo, tumekadiria kati ya {after} na {before}.",
    en: "You were not logging then, so this is estimated between {after} and {before}.",
  },
  "detect.title": { sw: "Vitu vya kuangalia", en: "Worth a look" },

  // AI insight
  "insight.title": { sw: "Uchambuzi wa AI", en: "AI analysis" },
  "insight.generate": { sw: "Chambua data yangu", en: "Analyse my data" },
  "insight.loading": { sw: "Inachambua...", en: "Analysing..." },
  "insight.refresh": { sw: "Chambua upya", en: "Analyse again" },
  "insight.notConfigured": {
    sw: "Uchambuzi wa AI haujawashwa bado. Ongeza ANTHROPIC_API_KEY kwenye mipangilio ya seva.",
    en: "AI analysis is not switched on yet. Add ANTHROPIC_API_KEY to the server settings.",
  },
  "insight.error": { sw: "Imeshindikana kuchambua, jaribu tena.", en: "Could not analyse, try again." },
  "insight.needData": {
    sw: "Sajili usomaji zaidi kwanza, angalau nne katika siku tatu.",
    en: "Log a few more readings first, at least four across three days.",
  },
  "insight.asOf": { sw: "Ilichambuliwa {when}", en: "Analysed {when}" },
  "insight.disclaimer": {
    sw: "Haya ni makadirio kutoka kwenye data yako mwenyewe, siyo uhakika.",
    en: "These are estimates from your own data, not certainties.",
  },

  // Vendor analytics
  "analytics.vendorTitle": { sw: "Bei kwa kila muuzaji", en: "Price by vendor" },
  "analytics.perUnit": { sw: "TZS kwa kitengo", en: "TZS per unit" },
  "analytics.vendorBest": {
    sw: "{vendor} ndio nafuu kwako, TZS {rate} kwa kitengo. Ghali zaidi ni {worst} kwa TZS {worstRate}.",
    en: "{vendor} is your cheapest at TZS {rate} per unit. The dearest is {worst} at TZS {worstRate}.",
  },
  "analytics.vendorSaving": {
    sw: "Ukinunua {vendor} pekee, ungeokoa takriban TZS {amount} kwa manunuzi uliyofanya.",
    en: "Buying only from {vendor} would have saved about TZS {amount} across the purchases you made.",
  },
  "analytics.vendorNeedData": {
    sw: "Sajili manunuzi kutoka sehemu mbili tofauti ili kulinganisha bei.",
    en: "Log purchases from two different places to compare prices.",
  },
  "analytics.vendorCount": { sw: "manunuzi {count}", en: "{count} purchases" },

  // Purchase lifetimes in history
  "history.lastedDays": { sw: "Ilidumu siku {days}", en: "Lasted {days} days" },
  "history.stillRunning": { sw: "Inatumika sasa, siku {days}", en: "In use now, day {days}" },
  "history.notStarted": { sw: "Bado haijaanza kutumika", en: "Not started yet" },
  "history.vendorLabel": { sw: "Muuzaji", en: "Vendor" },

  // Common
  "common.loading": { sw: "Inapakia...", en: "Loading..." },
  "common.error": { sw: "Hitilafu imetokea", en: "An error occurred" },
  "common.kwhDay": { sw: "kWh/siku", en: "kWh/day" },
  "common.above": { sw: "juu ya", en: "above" },
  "common.below": { sw: "chini ya", en: "below" },
  "common.usual": { sw: "kawaida yako", en: "your usual" },
  "common.weekOf": { sw: "Wiki ya", en: "Week of" },
};

export function tr(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = t[key];
  if (!entry) return key;
  let text = entry[lang] || entry.en || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export default t;
