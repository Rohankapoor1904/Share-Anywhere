package com.rohan.localshare

import com.rohan.localshare.transfer.ChunkEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files

class ChunkEngineTest {

    private lateinit var tempDir: File
    private lateinit var chunkEngine: ChunkEngine

    @Before
    fun setUp() {
        tempDir = Files.createTempDirectory("chunk_engine_test").toFile()
        chunkEngine = ChunkEngine(tempDir)
    }

    @Test
    fun testChunkMathAndBoundaries() {
        val totalBytes = 2500L
        val chunkSize = 1000

        val count = chunkEngine.computeChunkCount(totalBytes, chunkSize)
        assertEquals(3, count)

        // Chunk 0: offset 0, len 1000
        assertEquals(0L, chunkEngine.getChunkOffset(0, chunkSize))
        assertEquals(1000, chunkEngine.getChunkLength(totalBytes, chunkSize, 0))

        // Chunk 1: offset 1000, len 1000
        assertEquals(1000L, chunkEngine.getChunkOffset(1, chunkSize))
        assertEquals(1000, chunkEngine.getChunkLength(totalBytes, chunkSize, 1))

        // Chunk 2: offset 2000, len 500 (last partial chunk)
        assertEquals(2000L, chunkEngine.getChunkOffset(2, chunkSize))
        assertEquals(500, chunkEngine.getChunkLength(totalBytes, chunkSize, 2))

        // Beyond end
        assertEquals(0, chunkEngine.getChunkLength(totalBytes, chunkSize, 3))
    }

    @Test
    fun testChunkWriteAndResume() {
        val fileName = "test_resume.bin"
        val chunk1 = byteArrayOf(1, 2, 3, 4, 5)
        val chunk2 = byteArrayOf(6, 7, 8, 9, 10)

        // Write first chunk
        chunkEngine.writeChunk(fileName, 0L, chunk1)
        val resumeOffset1 = chunkEngine.getResumeOffset(fileName)
        assertEquals(5L, resumeOffset1)

        // Write second chunk at offset 5
        chunkEngine.writeChunk(fileName, 5L, chunk2)
        val resumeOffset2 = chunkEngine.getResumeOffset(fileName)
        assertEquals(10L, resumeOffset2)

        // Finalize commit
        val finalFile = chunkEngine.commitFile(fileName)
        assertTrue(finalFile.exists())
        assertEquals(10L, finalFile.length())
    }
}

