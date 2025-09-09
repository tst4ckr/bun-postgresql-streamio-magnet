import Kitsu from 'kitsu';

const api = new Kitsu();
const searchTerm = 'My Hero Academia';

async function findKitsuId() {
  console.log(`Searching for "${searchTerm}" on Kitsu...`);
  try {
    const { data } = await api.get('anime', {
      params: {
        filter: { text: searchTerm },
        page: { limit: 1 }
      }
    });

    if (data && data.length > 0) {
      const anime = data[0];
      console.log(`Found: ${anime.attributes.canonicalTitle} (ID: ${anime.id})`);
    } else {
      console.log(`No results found for "${searchTerm}".`);
    }
  } catch (error) {
    console.error('Error fetching data from Kitsu:', error);
  }
}

findKitsuId();