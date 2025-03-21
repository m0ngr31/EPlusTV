const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.3',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.3',
  'Mozilla/5.0 (X11; Linux i686; rv:133.0) Gecko/20100101 Firefox/133.0',
];

export const cbsSportsUserAgent = 'CBSSports/7.4.0-1739899507 (androidtv)';

export const androidFoxUserAgent =
  'foxsports-androidtv/3.42.1 (Linux;Android 9.0.0;SHIELD Android TV) ExoPlayerLib/2.12.1';

export const okHttpUserAgent = 'okhttp/4.11.0';

export const floSportsUserAgent =
  'Dalvik/2.1.0 (Linux; U; Android 9; sdk_google_atv_x86 Build/PSR1.180720.121) FloSports/2.11.0-2220530';

export const oktaUserAgent = 'okta-auth-js/7.0.2 okta-signin-widget-7.14.0';

export const b1gUserAgent = 'Ktor client';

export const nhlTvUserAgent =
  'Mozilla/5.0 (Linux; Android 11; AOSP TV on x86 Build/RTU1.221129.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.91 Mobile Safari/537.36';

export const androidMlbUserAgent =
  'com.bamnetworks.mobile.android.gameday.atbat/7.36.0.23 (Android 9;en_US;sdk_google_atv_x86;Build/PSR1.180720.121)';

export const adobeNesnUserAgent =
  'Mozilla/5.0 (Linux; Android 10; sdk_google_atv_x86 Build/QTU1.200805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.101 Mobile Safari/537.36 AdobePassNativeClient/3.6.1';

// Will generate one random User Agent for the session
export const userAgent = (() => userAgents[Math.floor(Math.random() * userAgents.length)])();
