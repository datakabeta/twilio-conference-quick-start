const config = require("../config");


exports.conDB = async function conDB() {
  const mysql = require('mysql2');
  console.log("config", config);
  console.log("config.dbHost", config.dbHost);
  console.log("config.dbUsername", config.dbUsername);
  console.log("config.dbPwd", config.dbPwd);

  const con = mysql.createConnection({
    host: config.dbHost,
    user: config.dbUsername,
    password: '',
    port: 3306
  });

  console.log(con);

  con.connect(function (err) {
    if (err) throw err;
    console.log("Connected!");

  // //Create conferences table
  // const conferencesTable = "CREATE TABLE conferences (Conference_ID VARCHAR(30) NOT NULL, Room_Name VARCHAR(30) NOT NULL), PRIMARY KEY (Conference_D)";
  // con.query(conferencesTable, function (err, result) {
  //   if (err) throw err;
  //   console.log("Table created");
  // });

  // //Create callSIDs table
  // const conferencesTable = "CREATE TABLE conferences (Conference_ID VARCHAR(30) NOT NULL, Room_Name VARCHAR(30) NOT NULL), PRIMARY KEY (Conference_D)";
  // con.query(conferencesTable, function (err, result) {
  //   if (err) throw err;
  //   console.log("Table created");
  // });

  });


  return {
    status: "DBCreated"
  };
};