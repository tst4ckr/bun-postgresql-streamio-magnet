import M3UGeneratorService from '../src/infrastructure/services/M3UGeneratorService.js';

const service = new M3UGeneratorService();

const channels = [
  { name: '3ABN Kids', streamUrl: 'http://3abn.example/playlist.m3u8', logo: 'logos/tv_3abn_kids.png', category: 'Infantil' },
  { name: 'PBS Kids', streamUrl: 'http://pbs.example/playlist.m3u8', category: 'Infantil' },
  { name: 'UCL', streamUrl: 'http://ucl.example/playlist.m3u8' },
  { name: 'UCL', streamUrl: 'http://ucl2.example/playlist.m3u8' }
];

const m3u = service.generateM3U(channels, { tvgIdPrefix: 'tv_' });
console.log(m3u);