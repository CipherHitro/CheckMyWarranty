import jwt from 'jsonwebtoken';
import 'dotenv/config';

const accessSecret = process.env.ACCESS_TOKEN_SECRET;

export function setUser(user){
    return jwt.sign({
        id: user.id,
        name: user.name,
        email: user.email
    }, accessSecret, { expiresIn: "15m" });
}

export function getUser(token){
    if(!token) return null;

    try {
        return jwt.verify(token, accessSecret);
    }
    catch(err){
        return null;
    }
}