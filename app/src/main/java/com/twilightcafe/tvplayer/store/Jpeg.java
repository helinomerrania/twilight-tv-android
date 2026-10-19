package com.twilightcafe.tvplayer.store;

/** Pictures from the phone page: base64 text to bytes, and whether the bytes are a JPEG. Plain Java. */
public final class Jpeg {

    private Jpeg() {
    }

    /** A JPEG starts FF D8 FF */
    public static boolean valid(byte[] b) {
        return b != null && b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    /** Base64 (standard or URL-safe, with or without padding or a "data:...;base64," prefix) -> bytes, or null. */
    public static byte[] decode(String s) {
        if (s == null) return null;
        int comma = s.indexOf(',');
        if (s.startsWith("data:") && comma > 0) s = s.substring(comma + 1);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(s.length() * 3 / 4 + 3);
        int acc = 0, bits = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int v;
            if (c >= 'A' && c <= 'Z') v = c - 'A';
            else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
            else if (c >= '0' && c <= '9') v = c - '0' + 52;
            else if (c == '+' || c == '-') v = 62;
            else if (c == '/' || c == '_') v = 63;
            else if (c == '=') break;
            else if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
            else return null;
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write((acc >> bits) & 0xFF);
            }
        }
        return out.toByteArray();
    }
}
