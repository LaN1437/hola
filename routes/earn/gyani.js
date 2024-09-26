const fetch = require('node-fetch');

module.exports.load = async function (app, db) {
  const glcodes = {};
  const cooldowns = {};

  function generateUserCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  }

  app.get(`/earn/gyani/generate`, async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    if (cooldowns[req.session.userinfo.hcid] && cooldowns[req.session.userinfo.hcid] > Date.now()) {
      return res.redirect(`/earn`);
    } else if (cooldowns[req.session.userinfo.hcid]) {
      delete cooldowns[req.session.userinfo.hcid];
    }

    const dailyTotal = await db.get(`dailygyani-${req.session.userinfo.hcid}`);
    if (dailyTotal && dailyTotal >= settings.earn.gyanilinks.dailyLimit) {
      return res.redirect(`/earn?err=REACHEDDAILYLIMIT`);
    }

    const userCode = generateUserCode();
    glcodes[req.session.userinfo.hcid] = {
      code: userCode,
      generated: Date.now(),
      redeemed: false,
    };

    const link = `${settings.authentication.discord.link}/earn/gyani/redeem/${userCode}`;
    const alias = generateUserCode()

    try {
      const response = await fetch(`https://gyanilinks.com/api?api=${settings.earn.gyanilinks.apiKey}&url=${encodeURIComponent(link)}&alias=holaclient${alias}`);
      const data = await response.json();
      if (response.ok) {
        res.json({ link: data.shortenedUrl });
        console.log(`${req.session.userinfo.username} generated a gyani link: `, data.shortenedUrl);
      } else {
        console.error('Error generating gyani.io link:', data);
        res.status(500).json({ error: 'GYANIERROR' });
      }
    } catch (error) {
      console.error('Error generating gyani.io link:', error);
      res.status(500).json({ error: 'GYANIERROR' });
    }
  });

  app.get(`/earn/gyani/redeem/:code`, async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/");
    if (cooldowns[req.session.userinfo.hcid] && cooldowns[req.session.userinfo.hcid] > Date.now()) {
      return res.redirect(`/earn`);
    } else if (cooldowns[req.session.userinfo.hcid]) {
      delete cooldowns[req.session.userinfo.hcid];
    }
    const code = req.params.code;
    if (!code) return res.send('<body style="background-color: #1b1c1d;"><center><h1 style="color: white">Error Code: HCGL001</h1><br><h2 style="color: white">You can get more information about this code on our <a style="color: white" href="https://discord.gg/CvqRH9TrYK">support</a> server!</h2></center>');
    const usercode = glcodes[req.session.userinfo.hcid];
    if (!usercode) return res.redirect(`/earn`);
    if (usercode.code !== code) return res.redirect(`/earn`);
    if (usercode.redeemed) return res.redirect(`/earn`);
    usercode.redeemed = true;
    if (((Date.now() - usercode.generated) / 1000) < settings.earn.gyanilinks.minTimeToComplete) {
      return res.send('<body style="background-color: #1b1c1d;"><center><h1 style="color: white">Error Code: HCGL002</h1><br><h2 style="color: white">You can get more information about this code on our <a style="color: white" href="https://discord.gg/CvqRH9TrYK">support</a> server!</h2></center>');
    }
    cooldowns[req.session.userinfo.hcid] = Date.now() + settings.earn.gyanilinks.cooldown * 60 * 1000;
    await db.set(`dailygyani-${req.session.userinfo.hcid}`, 1);
    const coins = await db.get(`coins-${req.session.userinfo.hcid}`)
    await db.set(`coins-${req.session.userinfo.hcid}`, coins + settings.earn.gyanilinks.coins)    
    res.redirect(`/earn?err=SUCCESSGYANI`);
  });
};
