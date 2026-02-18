const jwt = require('jsonwebtoken')
require('dotenv').config();
const secret = process.env.secret

function setUser(user){
    return jwt.sign({
        id:user.id,
        name:user.name,
        email:user.email
    }, secret)
}

function getUser(token){
    if(!token) return null;

    try {
        return jwt.verify(token, secret);
    }
    catch(err){
        return null;
    }
}

module.exports = {
    setUser,
    getUser
}