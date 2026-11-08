import { PROVIDERS } from '../resolver';
import { Anime, ServerOption } from '../types/anime';


const SAMPLE_STREAMS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
];

export const SERVERS: ServerOption[] = PROVIDERS.map((provider, index) => {
  const audio = provider.capabilities.audio ?? ['sub'];
  return {
    id: provider.id,
    name: `Server ${index + 1}`,
    speed: 'Normal',
    supportsSub: audio.includes('sub') || audio.includes('multi'),
    supportsDub: audio.includes('dub') || audio.includes('multi'),
    supportsDownload: false,
  } satisfies ServerOption;
});




export function getAnimeAniListId(anime: Anime): number {
  if (anime.anilistId && !isNaN(anime.anilistId)) return anime.anilistId;
  const parsed = parseInt(anime.id, 10);
  if (!isNaN(parsed) && parsed > 0) return parsed;

  const SLUG_MAP: Record<string, number> = {
    'gushing-over-magical-girls': 162780,
    'eminence-in-shadow': 130298,
    'aristocrat-otherworldly-adventure': 153332,
    'arifureta-strongest': 100668,
    'farming-life-another-world': 146850,
    'worlds-finest-assassin': 129898,
    'eighty-six': 116589,
    'loner-life-another-world': 173693,
    'frieren': 154587,
    'apothecary-diaries': 161645,
    'dandadan': 171018,
    'solo-leveling': 151807,
    'chainsaw-man': 127230,
    'jujutsu-kaisen': 113415,
    'demon-slayer': 101922,
    'spy-x-family': 140960,
    'mushoku-tensei': 108465,
    'oshi-no-ko': 150672,
    'hells-paradise': 128893,
    'bleach-tybw': 114446,
    'one-piece': 21,
  };

  return SLUG_MAP[anime.id] || 162780;
}

export const ANIME_CATALOG: Anime[] = [
  {
    id: 'gushing-over-magical-girls',
    title: 'Gushing Over Magical Girls',
    romajiTitle: 'Mahou Shoujo ni Akogarete',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx162780-hM1e2rGgQp9e.jpg',
    score: 74,
    format: 'TV',
    year: 2024,
    status: 'Finished',
    durationMins: 24,
    genres: ['Comedy', 'Ecchi', 'Mahou Shoujo', 'Slice of Life'],
    synopsis: 'Hiiragi Utena is a major fangirl of the magical girls protecting her city, so when she has the chance to become one herself, she leaps at the chance to join their technicolor ranks... but when she transforms, she learns she isn’t fated to be a daring do-gooder, but rather a villain on the side of evil!',
    studio: 'Asahi Production',
    startDate: '1/3/2024',
    seasonName: 'Winter',
    membersCount: 79919,
    trailerUrl: SAMPLE_STREAMS[3],
    hasDub: true,
    hasSub: true,
    airSchedule: {
      dayOfWeek: 3,
      airTime: '23:30',
      nextEpisode: 13
    },
    seasons: [
      {
        id: 'gomg-s1',
        number: 1,
        title: 'Season 1',
        year: 2024,
        episodes: [
          {
            id: 'gomg-ep-1',
            number: 1,
            title: 'A Villain Is Born?!',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
            videoUrl: SAMPLE_STREAMS[0],
            synopsis: 'Utena Hiiragi loves magical girls more than anything. One evening, a mysterious flying creature named Venalita appears with a contract.',
            airedDate: 'Jan 3, 2024'
          },
          {
            id: 'gomg-ep-2',
            number: 2,
            title: 'Her Name Is Magia Baiser!',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
            videoUrl: SAMPLE_STREAMS[1],
            synopsis: 'Utena discovers her alter ego Magia Baiser has formidable sadistic powers that fluster even the Tres Magia.',
            airedDate: 'Jan 10, 2024'
          },
          {
            id: 'gomg-ep-3',
            number: 3,
            title: 'The Explosive Leopard!',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
            videoUrl: SAMPLE_STREAMS[2],
            synopsis: 'A wild new villain named Leopard appears, armed with an arsenal of explosive military gear and an untamable temperament.',
            airedDate: 'Jan 17, 2024'
          },
          {
            id: 'gomg-ep-4',
            number: 4,
            title: 'Everyone Loves the Tres Magia!',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
            videoUrl: SAMPLE_STREAMS[3],
            synopsis: 'The Tres Magia hold a public concert and photo shoot, but Enormeeta arrives to turn the event upside down.',
            airedDate: 'Jan 24, 2024'
          },
          {
            id: 'gomg-ep-5',
            number: 5,
            title: 'NeroAlice in Wonderland',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/162780-qQ48pXg4t5Gk.jpg',
            videoUrl: SAMPLE_STREAMS[0],
            synopsis: 'The introverted dollmaker Alice Morino traps both villains and heroes inside her fantastical toy realm.',
            airedDate: 'Jan 31, 2024'
          }
        ]
      }
    ],
    related: [
      {
        id: 'gomg-s1',
        title: 'Gushing Over Magical Girls',
        relation: 'Season 1',
        format: 'TV',
        year: 2024,
        poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx162780-hM1e2rGgQp9e.jpg',
        episodesCount: 13
      },
      {
        id: 'gomg-s2',
        title: 'Mahou Shoujo ni Akogarete 2nd Season',
        relation: 'Season 2',
        format: 'TV',
        year: 2025,
        poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx162780-hM1e2rGgQp9e.jpg',
        episodesCount: 12
      }
    ]
  },
  {
    id: 'eminence-in-shadow',
    title: 'The Eminence in Shadow',
    romajiTitle: 'Kage no Jitsuryokusha ni Naritakute!',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/130298-H7Zf785yV5N7.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130298-gP6u0oK2hW0j.jpg',
    score: 85,
    format: 'TV',
    year: 2022,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Comedy', 'Fantasy', 'Isekai'],
    synopsis: 'Great heroes and diabolical villains are the types of characters people long to be—but not Cid Kagenou. He aspires to become the mastermind behind it all, pulling the strings and showing the world the true definition of "I Am Atomic".',
    studio: 'Nexus',
    startDate: '10/5/2022',
    seasonName: 'Fall',
    membersCount: 230910,
    trailerUrl: SAMPLE_STREAMS[0],
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'eis-s1',
        number: 1,
        title: 'Season 1',
        year: 2022,
        episodes: [
          {
            id: 'eis-ep-1',
            number: 1,
            title: 'The Hated Classmate',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/130298-H7Zf785yV5N7.jpg',
            videoUrl: SAMPLE_STREAMS[0]
          },
          {
            id: 'eis-ep-2',
            number: 2,
            title: 'Shadow Garden Is Born',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/130298-H7Zf785yV5N7.jpg',
            videoUrl: SAMPLE_STREAMS[1]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'aristocrat-otherworldly-adventure',
    title: "The Aristocrat's Otherworldly Adventure",
    romajiTitle: 'Tensei Kizoku no Isekai Boukenroku',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/153332-i5O5p3iT63mQ.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153332-kY49E5Hsq2h2.jpg',
    score: 66,
    format: 'TV',
    year: 2023,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Comedy', 'Fantasy', 'Romance'],
    synopsis: 'Shiina Kazuya is killed protecting a young girl and reincarnated as Cain von Silford, the third son of an aristocratic family, with stats that could only be described as divine overkill!',
    studio: 'EMT Squared / Magic Bus',
    startDate: '4/2/2023',
    seasonName: 'Spring',
    membersCount: 88000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'aristocrat-s1',
        number: 1,
        title: 'Season 1',
        year: 2023,
        episodes: [
          {
            id: 'aristo-ep-1',
            number: 1,
            title: 'Reborn in Another World',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/153332-i5O5p3iT63mQ.jpg',
            videoUrl: SAMPLE_STREAMS[2]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'arifureta-strongest',
    title: "Arifureta: From Commonplace to World's Strongest",
    romajiTitle: 'Arifureta Shokugyou de Sekai Saikyou',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/100668-9ZQSB5x5St7c.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx100668-DvOn5bMOt4cy.jpg',
    score: 65,
    format: 'TV',
    year: 2019,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Adventure', 'Fantasy', 'Psychological'],
    synopsis: 'When a classroom of students is transported to another world, Hajime Nagumo finds himself the weakest link. Betrayed and left to die in the deepest depths of the abyss, he resolves to forge his own path.',
    studio: 'white fox / asread.',
    startDate: '7/8/2019',
    seasonName: 'Summer',
    membersCount: 310000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'arifureta-s1',
        number: 1,
        title: 'Season 1',
        year: 2019,
        episodes: [
          {
            id: 'ari-ep-1',
            number: 1,
            title: 'The Monster of the Abyss',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/100668-9ZQSB5x5St7c.jpg',
            videoUrl: SAMPLE_STREAMS[3]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'farming-life-another-world',
    title: 'Farming Life in Another World',
    romajiTitle: 'Isekai Nonbiri Nouka',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/146850-GmkEchiYFCQE.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx146850-xfeAFIE0M9hl.jpg',
    score: 74,
    format: 'TV',
    year: 2023,
    status: 'Finished',
    durationMins: 24,
    genres: ['Fantasy', 'Slice of Life'],
    synopsis: 'Given a second chance at life and a magical all-purpose farming tool, Hiraku enjoys an idyllic, peaceful existence farming in the Great Forest, gradually attracting elves, beastmen, and dragons.',
    studio: 'Zero-G',
    startDate: '1/6/2023',
    seasonName: 'Winter',
    membersCount: 115000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'farm-s1',
        number: 1,
        title: 'Season 1',
        year: 2023,
        episodes: [
          {
            id: 'farm-ep-1',
            number: 1,
            title: 'The All-Purpose Farming Tool',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/146850-GmkEchiYFCQE.jpg',
            videoUrl: SAMPLE_STREAMS[0]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'worlds-finest-assassin',
    title: "The World's Finest Assassin Gets Reincarnated in Another World as an Aristocrat",
    romajiTitle: 'Sekai Saikou no Ansatsusha',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/129898-Qp41lxD3wU9e.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx129898-FRUzDtPhRigt.jpg',
    score: 72,
    format: 'TV',
    year: 2021,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy'],
    synopsis: 'The greatest assassin on Earth is reincarnated by a goddess into a world of swords and sorcery with a single mission: assassinate the legendary Hero destined to bring ruin to the realm.',
    studio: 'SILVER LINK. / Studio Palette',
    startDate: '10/6/2021',
    seasonName: 'Fall',
    membersCount: 198000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'assassin-s1',
        number: 1,
        title: 'Season 1',
        year: 2021,
        episodes: [
          {
            id: 'assassin-ep-1',
            number: 1,
            title: 'Quantum of Trust',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/129898-Qp41lxD3wU9e.jpg',
            videoUrl: SAMPLE_STREAMS[1]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'eighty-six',
    title: '86 EIGHTY-SIX',
    romajiTitle: '86: Eighty Six',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/116589-SqwYWzaZCdD5.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116589-KawXHB6sApFt.jpg',
    score: 83,
    format: 'TV',
    year: 2021,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Drama', 'Mecha', 'Sci-Fi'],
    synopsis: 'Called "Juggernaut," these unmanned combat drones fight in the nonexistent eighty-sixth sector, piloted by the Eighty-Six who are treated as tools in a never-ending war.',
    studio: 'A-1 Pictures',
    startDate: '4/11/2021',
    seasonName: 'Spring',
    membersCount: 320000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: '86-s1',
        number: 1,
        title: 'Season 1',
        year: 2021,
        episodes: [
          {
            id: '86-ep-1',
            number: 1,
            title: 'Undertaker',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/116589-SqwYWzaZCdD5.jpg',
            videoUrl: SAMPLE_STREAMS[2]
          }
        ]
      }
    ],
    related: []
  },
  {
    id: 'loner-life-in-another-world',
    title: 'Loner Life in Another World',
    romajiTitle: 'Hitoribocchi no Isekai Kouryaku',
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/173693-TirKwvMQTEqr.jpg',
    posterImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx173693-tRLdDE1BieXe.png',
    score: 65,
    format: 'ONA',
    year: 2024,
    status: 'Finished',
    durationMins: 24,
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis: 'Haruka has been summoned into another world, but all the cheat skills were taken by other classmates. Armed with remnant skills, he thrives as a solo adventurer.',
    studio: 'Hayabusa Film / Passione',
    startDate: '10/4/2024',
    seasonName: 'Fall',
    membersCount: 68000,
    hasDub: true,
    hasSub: true,
    seasons: [
      {
        id: 'loner-s1',
        number: 1,
        title: 'Season 1',
        year: 2024,
        episodes: [
          {
            id: 'loner-ep-1',
            number: 1,
            title: 'Loner’s Leftover Skills',
            durationSec: 1440,
            thumbnail: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/173693-TirKwvMQTEqr.jpg',
            videoUrl: SAMPLE_STREAMS[3]
          }
        ]
      }
    ],
    related: []
  }
];

export const INITIAL_CONTINUE_WATCHING = [
  {
    animeId: 'gushing-over-magical-girls',
    episodeNumber: 3,
    currentTimeSec: 216,
    durationSec: 1440,
    serverName: 'anikoto',
    audioMode: 'DUB' as const,
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  },
  {
    animeId: 'eminence-in-shadow',
    episodeNumber: 1,
    currentTimeSec: 960,
    durationSec: 1440,
    serverName: 'anikoto',
    audioMode: 'DUB' as const,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  },
  {
    animeId: 'aristocrat-otherworldly-adventure',
    episodeNumber: 2,
    currentTimeSec: 420,
    durationSec: 1440,
    serverName: 'anikoto',
    audioMode: 'DUB' as const,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
  },
  {
    animeId: 'arifureta-strongest',
    episodeNumber: 1,
    currentTimeSec: 680,
    durationSec: 1440,
    serverName: 'anikoto',
    audioMode: 'DUB' as const,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
  },
  {
    animeId: 'farming-life-another-world',
    episodeNumber: 1,
    currentTimeSec: 1100,
    durationSec: 1440,
    serverName: 'animepahe',
    audioMode: 'DUB' as const,
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
  }
];
