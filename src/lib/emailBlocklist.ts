/**
 * Disposable/temporary email domain blocklist — 200+ domains
 * Used to prevent fake signups and temp mail usage
 */
const BLOCKED_DOMAINS = new Set([
  // Major disposable providers
  "mailinator.com", "tempmail.com", "guerrillamail.com", "yopmail.com",
  "throwaway.email", "fakeinbox.com", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "dispostable.com", "trashmail.com", "trashmail.me",
  "10minutemail.com", "tempail.com", "burnermail.io", "discard.email",
  "mailnesia.com", "maildrop.cc", "getairmail.com", "mohmal.com",
  "getnada.com", "temp-mail.org", "emailondeck.com", "mintemail.com",
  "tempinbox.com", "mailcatch.com", "inboxkitten.com", "tempr.email",
  "throwawaymail.com", "mailforspam.com", "spam4.me", "trashymail.com",
  "mytemp.email", "correotemporal.org", "crazymailing.com", "harakirimail.com",
  "mailnull.com", "mailscrap.com", "mailzilla.com", "nomail.xl.cx",
  "spamgourmet.com", "tempomail.fr", "tmpmail.net", "tmpmail.org",
  "wegwerfmail.de", "wegwerfmail.net", "yepmail.com", "jetable.org",
  "mailexpire.com", "tempmailo.com", "emailfake.com", "guerrillamail.info",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
  // Extended list
  "guerrillamail.biz", "mailtemp.org", "tempmail.plus", "tempmail.ninja",
  "tempmail.dev", "tempmail.one", "tempmail.email", "tempmail.io",
  "disposableemailaddresses.com", "fakemailgenerator.com", "tempemails.com",
  "10minutemail.net", "10minutemail.org", "20minutemail.com", "20minutemail.it",
  "mailtemp.net", "mail-temp.com", "temp-mail.io", "temp-mail.de",
  "temp-mail.ru", "temp-mail.us", "tempmail.de", "tempmail.it",
  "guerrillamail.us", "guerrillamail.xyz", "guerrillamail.top",
  "mailnator.com", "maildrop.me", "maildrop.cf", "maildrop.ga",
  "anonbox.net", "anonymbox.com", "bobmail.info", "binkmail.com",
  "bugmenot.com", "chacuo.net", "cock.li", "cool.fr.nf",
  "courriel.fr.nf", "cuvox.de", "dayrep.com", "dcemail.com",
  "deadaddress.com", "despam.it", "devnullmail.com", "dispomail.eu",
  "disposable-email.ml", "disposable.cf", "disposable.ga", "disposable.ml",
  "disposableaddress.com", "disposeamail.com", "dm.w3internet.co.uk",
  "dodgeit.com", "dodgit.com", "dontreg.com", "dontsendmespam.de",
  "drdrb.com", "dump-email.info", "dumpanyjunk.com", "dumpyemail.com",
  "e4ward.com", "emailigo.de", "emailisvalid.com", "emailresort.com",
  "emailsensei.com", "emailtemporario.com.br", "emailthe.net", "emailtmp.com",
  "emailwarden.com", "emailx.at.hm", "emz.net", "enterto.com",
  "ephemail.net", "etranquil.com", "etranquil.net", "etranquil.org",
  "evopo.com", "explodemail.com", "express.net.ua", "eyepaste.com",
  "fastacura.com", "filzmail.com", "fixmail.tk", "flyspam.com",
  "garliclife.com", "get2mail.fr", "getonemail.com", "getonemail.net",
  "girlsundertheinfluence.com", "gishpuppy.com", "goemailgo.com",
  "gotmail.net", "gotmail.org", "gowikibooks.com", "great-host.in",
  "greensloth.com", "guerrillamail.com", "haltospam.com", "hotpop.com",
  "ichimail.com", "imstations.com", "inbax.tk", "inbox.si",
  "inboxalias.com", "inboxclean.com", "inboxclean.org", "incognitomail.com",
  "incognitomail.net", "incognitomail.org", "insorg.org", "ipoo.org",
  "irish2me.com", "jetable.com", "jetable.fr.nf", "jetable.net",
  "jnxjn.com", "jourrapide.com", "junk1e.com", "kasmail.com",
  "kaspop.com", "keepmymail.com", "killmail.com", "killmail.net",
  "klzlk.com", "koszmail.pl", "kurzepost.de", "lifebyfood.com",
  "link2mail.net", "litedrop.com", "lol.ovpn.to", "lookugly.com",
  "lortemail.dk", "lovemeleaveme.com", "lr78.com", "lroid.com",
  "m21.cc", "mail-temporaire.fr", "mail.by", "mail.mezimages.net",
  "mail2rss.org", "mail333.com", "mailbidon.com", "mailblocks.com",
  "mailbucket.org", "mailcat.biz", "mailcatch.com", "maileater.com",
  "mailexpire.com", "mailfa.tk", "mailfreeonline.com", "mailguard.me",
  "mailin8r.com", "mailinater.com", "mailinator.net", "mailinator.org",
  "mailinator2.com", "mailincubator.com", "mailismagic.com", "mailmate.com",
  "mailme.ir", "mailme.lv", "mailmetrash.com", "mailmoat.com",
  "mailms.com", "mailquack.com", "mailrock.biz", "mailsac.com",
  "mailscrap.com", "mailseal.de", "mailshell.com", "mailsiphon.com",
  "mailslite.com", "mailtemp.info", "mailtothis.com", "mailtrash.net",
  "mailzilla.com", "makemetheking.com", "manifestgenerator.com",
  "mbx.cc", "mega.zik.dj", "meinspamschutz.de", "meltmail.com",
  "messagebeamer.de", "mezimages.net", "mfsa.ru", "mierdamail.com",
  "ministry-of-silly-walks.de", "mintemail.com", "moakt.com",
  "mobi.web.id", "mobileninja.co.uk", "moncourrier.fr.nf",
  "monemail.fr.nf", "monmail.fr.nf", "mt2015.com", "mx0.wwwnew.eu",
  "mycard.net.ua", "mycleaninbox.net", "myemailboxy.com",
  "mymail-in.net", "mymailoasis.com", "myspaceinc.com", "myspaceinc.net",
  "myspaceinc.org", "myspacepimpedup.com", "mytrashmail.com",
  "nabala.com", "neomailbox.com", "nepwk.com", "nervmich.net",
  "nervtansen.de", "netmails.com", "netmails.net", "neverbox.com",
  "no-spam.ws", "nobulk.com", "noclickemail.com", "nogmailspam.info",
  "nomail.pw", "nomail.xl.cx", "nomail2me.com", "nomorespamemails.com",
  "nospam.ze.tc", "nospam4.us", "nospamfor.us", "nospamthanks.info",
  "nothingtoseehere.ca", "nurfuerspam.de", "nus.edu.sg",
  "objectmail.com", "obobbo.com", "odnorazovoe.ru", "oneoffemail.com",
  "onewaymail.com", "oopi.org", "ordinaryamerican.net",
  "owlpic.com", "pancakemail.com", "pimpedupmyspace.com",
  "pjjkp.com", "plexolan.de", "pookmail.com", "privacy.net",
  "proxymail.eu", "prtnx.com", "putthisinyouremail.com",
  "qq.com", "quickinbox.com", "rcpt.at", "reallymymail.com",
  "receiveee.com", "recursor.net", "regbypass.com",
  "rejectmail.com", "reliable-mail.com", "rhyta.com",
  "rklips.com", "rmqkr.net", "royal.net", "rppkn.com",
  "rtrtr.com", "s0ny.net", "safe-mail.net", "safersignup.de",
  "safetymail.info", "safetypost.de", "sandelf.de",
  "saynotospams.com", "scatmail.com", "schafmail.de",
  "selfdestructingmail.com", "sendspamhere.com", "shieldemail.com",
  "shiftmail.com", "shitmail.me", "shortmail.net", "sibmail.com",
  "sinnlos-mail.de", "skeefmail.com", "slaskpost.se",
  "slipry.net", "slopsbox.com", "smashmail.de", "snoopmail.eu",
  "sofimail.com", "sofort-mail.de", "softpls.asia",
  "sogetthis.com", "soodonims.com", "spam.la", "spam.su",
  "spamavert.com", "spambob.com", "spambob.net", "spambob.org",
  "spambog.com", "spambog.de", "spambog.ru", "spambox.info",
  "spambox.irishspringrealty.com", "spambox.us", "spamcannon.com",
  "spamcannon.net", "spamcero.com", "spamcon.org", "spamcorptastic.com",
  "spamcowboy.com", "spamcowboy.net", "spamcowboy.org",
  "spamday.com", "spamex.com", "spamfighter.cf", "spamfighter.ga",
  "spamfighter.gq", "spamfighter.ml", "spamfighter.tk",
  "spamfree24.com", "spamfree24.de", "spamfree24.eu",
  "spamfree24.info", "spamfree24.net", "spamfree24.org",
  "spamgoes.in", "spamherelots.com", "spamhereplease.com",
  "spamhole.com", "spamify.com", "spaminator.de",
  "spamkill.info", "spaml.com", "spaml.de", "spammotel.com",
  "spamobox.com", "spamoff.de", "spamslicer.com",
  "spamspot.com", "spamstack.net", "spamthis.co.uk",
  "spamtrap.ro", "spamtrail.com", "speed.1s.fr",
  "suremail.info", "svk.jp", "sweetxxx.de",
  "tafmail.com", "tagyoureit.com", "talkinator.com",
  "tapchicuoihoi.com", "teewars.org", "teleworm.com",
  "teleworm.us", "temp-mail.com", "tempail.com",
  "tempalias.com", "tempe4mail.com", "tempemail.biz",
  "tempemail.co.za", "tempemail.com", "tempemail.net",
  "tempinbox.co.uk", "tempinbox.com", "tempmail.eu",
  "tempmail.it", "tempmail2.com", "tempmailer.com",
  "tempmailer.de", "tempomail.fr", "temporarily.de",
  "temporarioemail.com.br", "temporaryemail.net",
  "temporaryemail.us", "temporaryforwarding.com",
  "temporaryinbox.com", "temporarymailaddress.com",
  "thanksnospam.info", "thankyou2010.com",
  "thc.st", "tmail.ws", "tmailinator.com",
  "toiea.com", "tradermail.info", "trash-amil.com",
  "trash-mail.at", "trash-mail.com", "trash-mail.de",
  "trash2009.com", "trash2010.com", "trash2011.com",
  "trashdevil.com", "trashdevil.de", "trashmail.at",
  "trashmail.de", "trashmail.io", "trashmail.net",
  "trashmail.org", "trashmail.ws", "trashmailer.com",
  "trashymail.com", "trashymail.net", "trbvm.com",
  "trbvn.com", "trialmail.de", "trickmail.net",
  "trillianpro.com", "turual.com", "twinmail.de",
  "tyldd.com", "uggsrock.com", "umail.net",
  "upliftnow.com", "uplipht.com", "venompen.com",
  "veryreallysuckingmuch.com", "viditag.com",
  "viewcastmedia.com", "viewcastmedia.net",
  "viewcastmedia.org", "vomoto.com", "vpn.st",
  "vsimcard.com", "vubby.com", "wasteland.rfc822.org",
  "webemail.me", "weg-werf-email.de",
  "wegwerfadresse.de", "wegwerfemail.com",
  "wegwerfemail.de", "wegwerfmail.de", "wegwerfmail.info",
  "wegwerfmail.net", "wegwerfmail.org",
  "wetrainbayarea.com", "wetrainbayarea.org",
  "wh4f.org", "whatiaas.com", "whatpaas.com",
  "whyspam.me", "wickmail.net", "wilemail.com",
  "willhackforfood.biz", "willselfdestruct.com",
  "winemaven.info", "wronghead.com", "wuzup.net",
  "wuzupmail.net", "wwwnew.eu", "x.ip6.li",
  "xagloo.com", "xemaps.com", "xents.com",
  "xjoi.com", "xmaily.com", "xoxy.net",
  "yapped.net", "yep.it", "yogamaven.com",
  "yomail.info", "yopmail.fr", "yopmail.net",
  "yourdomain.com", "ypmail.webarnak.fr.eu.org",
  "yuurok.com", "zehnminutenmail.de",
  "zippymail.info", "zoaxe.com", "zoemail.org",
]);

/**
 * Pattern-based detection — catches domains containing common disposable keywords
 */
const BLOCKED_PATTERNS = [
  "tempmail", "throwaway", "disposable", "guerrilla", "fakeinbox",
  "trashmail", "spambox", "junkmail", "burnermail", "minutemail",
  "wegwerf", "mailtemp", "tmpmail", "tempinbox", "maildrop",
  "mailnator", "yopmail", "sharklaser", "spamfree", "nospam",
  "mailinator", "getairmail", "discard.email", "spam4", "10minute",
  "20minute", "tempmailo", "tempemail", "mailcatch", "inboxkitten",
];

/**
 * Check if an email uses a disposable/temporary domain
 * @returns error message if blocked, null if allowed
 */
export const validateEmailDomain = (email: string): string | null => {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "Please enter a valid email address.";

  // Exact domain match
  if (BLOCKED_DOMAINS.has(domain)) {
    return "This email provider is not allowed. Please use a valid email.";
  }

  // Pattern-based match — catches subdomains and variations
  for (const pattern of BLOCKED_PATTERNS) {
    if (domain.includes(pattern)) {
      return "This email provider is not allowed. Please use a valid email.";
    }
  }

  // Block numeric-heavy domains (common disposable pattern like "123mail456.com")
  const domainName = domain.split(".")[0];
  if (domainName && /^\d+[a-z]*\d+$/.test(domainName) && domainName.length > 6) {
    return "This email provider is not allowed. Please use a valid email.";
  }

  return null;
};
