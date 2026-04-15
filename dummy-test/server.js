// A very generic Express server often found in old tutorials
const express = require('express');
const mysql = require('mysql');
const app = express();

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "password123" // 🚩 LEAKED SECRET
});

app.get('/user', (req, res) => {
    const id = req.query.id;
    // 🚩 SQL INJECTION VULNERABILITY
    const query = "SELECT * FROM users WHERE id = " + id; 
    db.query(query, (err, result) => {
        res.send(result);
    });
});

app.listen(3000);