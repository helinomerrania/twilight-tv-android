package com.twilightcafe.tvplayer;

import org.junit.Test;
import static org.junit.Assert.*;

public class TitleBookTest {

    @Test
    public void isId_validIds_returnsTrue() {
        // Typical standard valid IDs
        assertTrue(TitleBook.isId("dQw4w9WgXcQ"));
        assertTrue(TitleBook.isId("aB3_dE-9xY1"));

        // Edge cases with boundaries of characters
        assertTrue(TitleBook.isId("-----------")); // All hyphens
        assertTrue(TitleBook.isId("___________")); // All underscores
        assertTrue(TitleBook.isId("01234567890")); // All numbers
        assertTrue(TitleBook.isId("abcdefghijk")); // All lowercase
        assertTrue(TitleBook.isId("ABCDEFGHIJK")); // All uppercase
    }

    @Test
    public void isId_invalidLength_returnsFalse() {
        assertFalse("Null string should return false", TitleBook.isId(null));
        assertFalse("Empty string should return false", TitleBook.isId(""));
        assertFalse("Short string (10 chars) should return false", TitleBook.isId("1234567890"));
        assertFalse("Long string (12 chars) should return false", TitleBook.isId("123456789012"));
    }

    @Test
    public void isId_invalidCharacters_returnsFalse() {
        assertFalse("Spaces are invalid", TitleBook.isId("dQw4w9Wg cQ"));
        assertFalse("Special characters like ! are invalid", TitleBook.isId("dQw4w9WgXc!"));
        assertFalse("Special characters like @ are invalid", TitleBook.isId("dQw4w9WgXc@"));
        assertFalse("Special characters like # are invalid", TitleBook.isId("dQw4w9WgXc#"));
        assertFalse("URL encoded characters are invalid", TitleBook.isId("dQw4w9WgXc%"));
        assertFalse("Accented characters are invalid", TitleBook.isId("dQw4w9WgXcé"));

        // Characters that look similar or might be edge cases
        assertFalse("Plus is invalid", TitleBook.isId("aB3_dE+9xY1"));
        assertFalse("Equals is invalid", TitleBook.isId("aB3_dE=9xY1"));
        assertFalse("Dot is invalid", TitleBook.isId("aB3_dE.9xY1"));
        assertFalse("Colon is invalid", TitleBook.isId("aB3_dE:9xY1"));
        assertFalse("Slash is invalid", TitleBook.isId("aB3_dE/9xY1"));
        assertFalse("Backslash is invalid", TitleBook.isId("aB3_dE\\9xY1"));
    }
}
