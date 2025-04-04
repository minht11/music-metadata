import initDebug from 'debug';
import { StringType, UINT8 } from 'token-types';

import * as util from '../common/Util.js';

import type { IGetToken, IRandomAccessTokenizer, ITokenizer } from 'strtok3';
import { BasicParser } from '../common/BasicParser.js';
import { APEv2Parser } from '../apev2/APEv2Parser.js';
import type { AnyTagValue, IApeHeader, IPrivateOptions } from '../type.js';
import type { INativeMetadataCollector } from '../common/MetadataCollector.js';

const debug = initDebug('music-metadata:parser:ID3v1');

/**
 * ID3v1 Genre mappings
 * Ref: https://de.wikipedia.org/wiki/Liste_der_ID3v1-Genres
 */
export const Genres = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
  'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock',
  'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack',
  'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance',
  'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
  'Alt. Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop',
  'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial',
  'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult',
  'Gangsta Rap', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American',
  'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal',
  'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
  'Folk', 'Folk/Rock', 'National Folk', 'Swing', 'Fast-Fusion', 'Bebob', 'Latin', 'Revival',
  'Celtic', 'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock',
  'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic', 'Humour',
  'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus',
  'Porn Groove', 'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore',
  'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle', 'Duet', 'Punk Rock', 'Drum Solo',
  'A Cappella', 'Euro-House', 'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House',
  'Hardcore', 'Terror', 'Indie', 'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat',
  'Christian Gangsta Rap', 'Heavy Metal', 'Black Metal', 'Crossover', 'Contemporary Christian',
  'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop', 'Synthpop',
  'Abstract', 'Art Rock', 'Baroque', 'Bhangra', 'Big Beat', 'Breakbeat', 'Chillout',
  'Downtempo', 'Dub', 'EBM', 'Eclectic', 'Electro', 'Electroclash', 'Emo', 'Experimental',
  'Garage', 'Global', 'IDM', 'Illbient', 'Industro-Goth', 'Jam Band', 'Krautrock',
  'Leftfield', 'Lounge', 'Math Rock', 'New Romantic', 'Nu-Breakz', 'Post-Punk', 'Post-Rock',
  'Psytrance', 'Shoegaze', 'Space Rock', 'Trop Rock', 'World Music', 'Neoclassical', 'Audiobook',
  'Audio Theatre', 'Neue Deutsche Welle', 'Podcast', 'Indie Rock', 'G-Funk', 'Dubstep',
  'Garage Rock', 'Psybient'
];

/**
 * ID3v1 tag header interface
 */
interface IId3v1Header {
  header: string,
  title?: string,
  artist?: string,
  album?: string,
  year?: string,
  comment?: string,
  zeroByte: number,
  track: number,
  genre: number
}

/**
 * Spec: http://id3.org/ID3v1
 * Wiki: https://en.wikipedia.org/wiki/ID3
 */
const Iid3v1Token: IGetToken<IId3v1Header | null> = {
  len: 128,

  /**
   * @param buf Buffer possibly holding the 128 bytes ID3v1.1 metadata header
   * @param off Offset in buffer in bytes
   * @returns ID3v1.1 header if first 3 bytes equals 'TAG', otherwise null is returned
   */
  get: (buf: Uint8Array, off): IId3v1Header | null => {
    const header = new Id3v1StringType(3).get(buf, off);
    return header === 'TAG' ? {
      header,
      title: new Id3v1StringType(30).get(buf, off + 3),
      artist: new Id3v1StringType(30).get(buf, off + 33),
      album: new Id3v1StringType(30).get(buf, off + 63),
      year: new Id3v1StringType(4).get(buf, off + 93),
      comment: new Id3v1StringType(28).get(buf, off + 97),
      // ID3v1.1 separator for track
      zeroByte: UINT8.get(buf, off + 127),
      // track: ID3v1.1 field added by Michael Mutschler
      track: UINT8.get(buf, off + 126),
      genre: UINT8.get(buf, off + 127)
    } : null;
  }
};

class Id3v1StringType implements IGetToken<string | undefined> {

  public len: number;

  private stringType;

  constructor(len: number) {
    this.len = len;
    this.stringType = new StringType(len, 'latin1');
  }

  public get(buf: Uint8Array, off: number): string | undefined {
    let value = this.stringType.get(buf, off);
    value = util.trimRightNull(value);
    value = value.trim();
    return value.length > 0 ? value : undefined;
  }
}

export class ID3v1Parser extends BasicParser {

  private apeHeader: IApeHeader | undefined;

  public constructor(metadata: INativeMetadataCollector, tokenizer: ITokenizer, options: IPrivateOptions) {
    super(metadata, tokenizer, options);
    this.apeHeader = options.apeHeader;
  }

  private static getGenre(genreIndex: number): string | undefined {
    if (genreIndex < Genres.length) {
      return Genres[genreIndex];
    }
    return undefined; // ToDO: generate warning
  }

  public async parse(): Promise<void> {

    if (!this.tokenizer.fileInfo.size) {
      debug('Skip checking for ID3v1 because the file-size is unknown');
      return;
    }

    if (this.apeHeader) {
      this.tokenizer.ignore(this.apeHeader.offset - this.tokenizer.position);
      const apeParser = new APEv2Parser(this.metadata, this.tokenizer, this.options);
      await apeParser.parseTags(this.apeHeader.footer);
    }

    const offset = this.tokenizer.fileInfo.size - Iid3v1Token.len;
    if (this.tokenizer.position > offset) {
      debug('Already consumed the last 128 bytes');
      return;
    }
    const header = await this.tokenizer.readToken<IId3v1Header | null>(Iid3v1Token, offset);
    if (header) {
      debug('ID3v1 header found at: pos=%s', this.tokenizer.fileInfo.size - Iid3v1Token.len);
      const props: Array<keyof IId3v1Header> = ['title', 'artist', 'album', 'comment', 'track', 'year'];
      for (const id of props) {
        if (header[id] && header[id] !== '')
          await this.addTag(id, header[id]);
      }
      const genre = ID3v1Parser.getGenre(header.genre);
      if (genre)
        await this.addTag('genre', genre);
    } else {
      debug('ID3v1 header not found at: pos=%s', this.tokenizer.fileInfo.size - Iid3v1Token.len);
    }
  }

  private async addTag(id: string, value: AnyTagValue): Promise<void> {
    await this.metadata.addTag('ID3v1', id, value);
  }
}

export async function hasID3v1Header(tokenizer: IRandomAccessTokenizer): Promise<boolean> {
  if (tokenizer.fileInfo.size >= 128) {
    const tag = new Uint8Array(3);
    const position = tokenizer.position;
    await tokenizer.readBuffer(tag, {position: tokenizer.fileInfo.size - 128});
    tokenizer.setPosition(position); // Restore tokenizer position
    return new TextDecoder('latin1').decode(tag) === 'TAG';
  }
  return false;
}
