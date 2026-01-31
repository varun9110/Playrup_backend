function capitalizeWords(str) {
  // Split the string by spaces, hyphens, or underscores
    const words = str.toLowerCase().split(/[ -_]+/);

  // Use map to iterate over each word and capitalize its first letter
  const capitalizedWords = words.map(word => {
    if (word.length === 0) {
      return ''; // Handle empty strings if present in the array
    }
    // Capitalize the first character and concatenate with the rest of the word
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Join the capitalized words back into a single string with spaces
  return capitalizedWords.join(' ');
}

function isTimeOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}


// Convert minutes back to "HH:MM"
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Helper: convert "HH:MM" to minutes
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Helper: calculate proportional price
function calculatePrice(pricesArray, startTime, duration) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + duration;
  let total = 0;

  for (let i = 0; i < pricesArray.length; i++) {
    const priceHourStart = timeToMinutes(pricesArray[i].time);
    const priceHourEnd = priceHourStart + 60; // each price is for 1 hour

    // Find overlap between requested duration and this hour slot
    const overlapStart = Math.max(startMinutes, priceHourStart);
    const overlapEnd = Math.min(endMinutes, priceHourEnd);
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

    if (overlapMinutes > 0) {
      // Add proportional price
      total += (overlapMinutes / 60) * pricesArray[i].price;
    }
  }

  return total;
}

module.exports = { capitalizeWords, isTimeOverlap, timeToMinutes, calculatePrice, minutesToTime };