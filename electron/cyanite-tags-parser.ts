import fs from 'fs';
import path from 'path';

interface CyaniteTags {
  mainGenres: Set<string>;
  subGenres: Set<string>;
  simpleMoods: Set<string>;
  moods: Set<string>;
  characters: Set<string>;
}

let cachedTags: CyaniteTags | null = null;

export function parseCyaniteTags(): CyaniteTags {
  if (cachedTags) {
    return cachedTags;
  }

  const csvPath = path.join(__dirname, 'cyanite_tags.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('[CyaniteTags] CSV file not found:', csvPath);
    // Return empty sets if file doesn't exist
    return {
      mainGenres: new Set(),
      subGenres: new Set(), 
      simpleMoods: new Set(),
      moods: new Set(),
      characters: new Set()
    };
  }

  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    
    if (lines.length < 2) {
      console.error('[CyaniteTags] CSV file appears to be empty or malformed');
      return {
        mainGenres: new Set(),
        subGenres: new Set(),
        simpleMoods: new Set(),
        moods: new Set(),
        characters: new Set()
      };
    }

    // Parse header to find column indices
    // Handle both single-line and multi-line header formats
    let headers: string[] = [];
    let dataStartLine = 1;
    
    // Split by comma but handle quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/"/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/"/g, ''));
      return result;
    };
    
    // Check if we have the new format (main_genres) or old format (MAIN GENRES)
    const firstLine = parseCSVLine(lines[0]);
    if (firstLine.some(col => col.toLowerCase().includes('main_genres'))) {
      // New single-line format
      headers = firstLine;
      dataStartLine = 1;
    } else {
      // Old multi-line format - combine first two lines
      const secondLine = parseCSVLine(lines[1]);
      headers = parseCSVLine(lines[0] + ' ' + lines[1]);
      dataStartLine = 2;
    }
    
    const mainGenresIdx = headers.findIndex(col => 
      col.toLowerCase().includes('main_genres') || col.toLowerCase().includes('main genres')
    );
    const subGenresIdx = headers.findIndex(col => 
      col.toLowerCase().includes('sub_genres') || col.toLowerCase().includes('sub genres')
    );
    const simpleMoodsIdx = headers.findIndex(col => 
      col.toLowerCase().includes('simple_moods') || col.toLowerCase().includes('simple moods')
    );
    const moodsIdx = headers.findIndex(col => 
      col.toLowerCase().includes('moods') && !col.toLowerCase().includes('simple')
    );
    const charactersIdx = headers.findIndex(col => 
      col.toLowerCase().includes('character')
    );

    const tags: CyaniteTags = {
      mainGenres: new Set(),
      subGenres: new Set(),
      simpleMoods: new Set(), 
      moods: new Set(),
      characters: new Set()
    };

    // Parse each data row
    for (let i = dataStartLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = parseCSVLine(line);
      
      // Helper function to add non-empty values to a set
      const addToSet = (set: Set<string>, columnIdx: number) => {
        if (columnIdx !== -1 && columns[columnIdx]) {
          const value = columns[columnIdx].trim().replace(/"/g, '');
          if (value && value !== 'N/A' && value !== '' && value !== 'mm:ss') {
            set.add(value);
          }
        }
      };

      addToSet(tags.mainGenres, mainGenresIdx);
      addToSet(tags.subGenres, subGenresIdx);
      addToSet(tags.simpleMoods, simpleMoodsIdx);
      addToSet(tags.moods, moodsIdx);
      addToSet(tags.characters, charactersIdx);
    }

    console.log(`[CyaniteTags] Parsed tags - Main Genres: ${tags.mainGenres.size}, Sub Genres: ${tags.subGenres.size}, Simple Moods: ${tags.simpleMoods.size}, Moods: ${tags.moods.size}, Characters: ${tags.characters.size}`);
    
    cachedTags = tags;
    return tags;
  } catch (error) {
    console.error('[CyaniteTags] Error parsing CSV file:', error);
    return {
      mainGenres: new Set(),
      subGenres: new Set(),
      simpleMoods: new Set(),
      moods: new Set(),
      characters: new Set()
    };
  }
}

export function getAllValidTags(): string[] {
  const tags = parseCyaniteTags();
  const allTags: string[] = [];
  
  // Combine all tag categories
  tags.mainGenres.forEach(tag => allTags.push(tag));
  tags.subGenres.forEach(tag => allTags.push(tag));
  tags.simpleMoods.forEach(tag => allTags.push(tag));
  tags.moods.forEach(tag => allTags.push(tag));
  tags.characters.forEach(tag => allTags.push(tag));
  
  return [...new Set(allTags)].sort(); // Remove duplicates and sort
}

export function isValidTag(tag: string): boolean {
  const validTags = getAllValidTags();
  return validTags.some(validTag => 
    validTag.toLowerCase() === tag.toLowerCase().trim()
  );
}

export function validatePromptTags(promptText: string): { 
  validTags: string[], 
  invalidTags: string[], 
  isValid: boolean 
} {
  // Split by commas and clean up
  const tags = promptText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  const validTags: string[] = [];
  const invalidTags: string[] = [];
  
  tags.forEach(tag => {
    if (isValidTag(tag)) {
      validTags.push(tag);
    } else {
      invalidTags.push(tag);
    }
  });
  
  return {
    validTags,
    invalidTags,
    isValid: invalidTags.length === 0
  };
}

export function filterToValidTags(promptText: string): string {
  const validation = validatePromptTags(promptText);
  return validation.validTags.join(', ');
} 