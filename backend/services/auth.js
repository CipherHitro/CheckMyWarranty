import jwt from 'jsonwebtoken';
import 'dotenv/config';

const secret = process.env.secret;

export function setUser(user){
    return jwt.sign({
        id:user.id,
        name:user.name,
        email:user.email
    }, secret);
}

export function getUser(token){
    if(!token) return null;

    try {
        return jwt.verify(token, secret);
    }
    catch(err){
        return null;
    }
}