const VoiceResponse = require("twilio").twiml.VoiceResponse;
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const SyncGrant = AccessToken.SyncGrant;

const nameGenerator = require("../name_generator");
const config = require("../config");

const client = require('twilio')(config.accountSid, config.authToken);

var identity;
const SYNCSERVICEID = "IS9f06d3e79daa611bb94c63b1e9843b5d";

exports.tokenGenerator = function tokenGenerator() {
  identity = nameGenerator();

  const accessToken = new AccessToken(
    config.accountSid,
    config.apiKey,
    config.apiSecret
  );
  accessToken.identity = identity;
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: true,
  });

  const syncGrant = new SyncGrant({
    serviceSid: SYNCSERVICEID
  });
  accessToken.addGrant(voiceGrant);
  accessToken.addGrant(syncGrant);

  // Include identity and token in a JSON response
  return {
    identity: identity,
    token: accessToken.toJwt(),
  };
};

exports.voiceResponse = function voiceResponse(requestBody) {
  console.log("requestBody to voiceResponse: ", JSON.stringify(requestBody));
  const toNumberOrClientName = requestBody.To;
  const callerId = config.callerId;
  let twiml = new VoiceResponse();

  // If the request to the /voice endpoint is TO your Twilio Number, 
  // then it is an incoming call towards your Twilio.Device.
  if (toNumberOrClientName == callerId) {
    let dial = twiml.dial();

    // This will connect the caller with your Twilio.Device/client 
    dial.client(identity);

  } else if (requestBody.To) {
    //CONF - Start a conference

    console.log("Starting conference...");
    const dial = twiml.dial();
    dial.conference({
      statusCallback: `https://3eb9-2607-9880-3297-ffd2-7820-eb28-381-80ed.ngrok.io/events?to=${encodeURIComponent(requestBody.To)}`,
      statusCallbackEvent: 'start end join leave mute hold modify',
      startConferenceOnEnter: 'true',
      endConferenceOnExit: 'true'
    }, "RoomXOXO");

    console.log("Conference started");

    // This is an outgoing call

    // set the callerId
    // let dial = twiml.dial({ callerId });

    // // Check if the 'To' parameter is a Phone Number or Client Name
    // // in order to use the appropriate TwiML noun 
    // const attr = isAValidPhoneNumber(toNumberOrClientName)
    //   ? "number"
    //   : "client";
    // dial[attr]({}, toNumberOrClientName);
  } else {
    twiml.say("Thanks for calling!");
  }

  return twiml.toString();
};



/**
 * Checks if the given value is valid as phone number
 * @param {Number|String} number
 * @return {Boolean}
 */
function isAValidPhoneNumber(number) {
  return /^[\d\+\-\(\) ]+$/.test(number);
}
