const pool = require('./dbSync');

class User {
    constructor(userId, participantLabel=null, phoneNumber=null, callSid=null, isInCall='N') {
        this.userId = userId;
        this.participantLabel = participantLabel;
        this.phoneNumber = phoneNumber;
        this.callSid = callSid;
        this.isInCall = isInCall;
    }

    save(callback) {
        const query = {
            text: 'INSERT INTO users(userId, participantLabel, phoneNumber, callSid, isInCall) VALUES($1, $2, $3, $4, $5)',
            values: [this.userId, this.participantLabel, this.phoneNumber, this.callSid, this.isInCall],
        };

        pool.query(query, (err, res) => {
            if (err) {
                callback(err);
            } else {
                callback(null);
            }
        });
    }
}

class Conference {
    constructor(conferenceId, roomName=null) {
        this.conferenceId = conferenceId;
        this.roomName = roomName;
    }

    save(callback) {
        const query = {
            text: 'INSERT INTO conferences(conferenceId, roomName) VALUES($1, $2)',
            values: [this.conferenceId, this.name],
        };

        pool.query(query, (err, res) => {
            if (err) {
                callback(err);
            } else {
                callback(null);
            }
        });
    }
}

class Call {
    constructor(callSid, participantLabel=null, conferenceSid=null) {
        this.callSid = callSid;
        this.participantLabel = participantLabel;
        this.conferenceSid = conferenceSid;
    }

    save(callback) {
        const query = {
            text: 'INSERT INTO calls(callSid, participantLabel, conferenceSid) VALUES($1, $2, $3)',
            values: [this.callSid, this.participantLabel, this.conferenceSid],
        };

        pool.query(query, (err, res) => {
            if (err) {
                callback(err);
            } else {
                callback(null);
            }
        });
    }
}

module.exports = { User, Conference, Call };
