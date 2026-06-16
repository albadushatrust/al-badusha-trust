import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain) {
    return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
    if (!hash) return false;
    if (!hash.startsWith('$2')) {
        return plain === hash;
    }
    return bcrypt.compare(plain, hash);
}

export async function hashUsersPasswords(users) {
    const out = [];
    for (const user of users) {
        const copy = { ...user };
        if (copy.password && !copy.password.startsWith('$2')) {
            copy.password = await hashPassword(copy.password);
        }
        out.push(copy);
    }
    return out;
}
