package com.rohan.localshare

import com.rohan.localshare.util.PinModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinModuleTest {

    @Test
    fun testConstantTimeComparison() {
        assertTrue(PinModule.compareStringsConstantTime("123456", "123456"))
        assertFalse(PinModule.compareStringsConstantTime("123456", "123457"))
        assertFalse(PinModule.compareStringsConstantTime("123456", "12345"))
        assertFalse(PinModule.compareStringsConstantTime("12345", "123456"))
        assertTrue(PinModule.compareStringsConstantTime("", ""))
    }

    @Test
    fun testPinFormatAndLength() {
        val pin = PinModule.generateSecurePin()
        assertEquals(6, pin.length)
        assertTrue(pin.all { it.isDigit() })
    }
}

