const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.name.givenName,
  name: `${profile.name.givenName}${profile.name.familyName ? ` ${profile.name.familyName}` : ''}`,
  emailVerified: profile.emails[0].verified,
});

const googleLogin = socialLogin('google', getProfileDetails);

module.exports = () => {
  const rawServer = process.env.DOMAIN_SERVER || 'https://wappy.club';
  const domainServer = rawServer.replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
  const callbackPath = process.env.GOOGLE_CALLBACK_URL || '/oauth/google/callback';
  return new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${domainServer}${callbackPath}`,
      proxy: true,
    },
    googleLogin,
  );
};
