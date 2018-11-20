// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {App} from './app'
import {COL_LABELS, Color, Move, N, Nullable, toKgs} from './base'
import {Board, ClickableBoard} from './board'
import * as lyr from './layer'
import {Log} from './log'
import {Position} from './position'
import {getElement, toPrettyResult} from './util'
import {WinrateGraph} from './winrate_graph'

const HUMAN = 'Human';
const MINIGO = 'Minigo';

// Demo app implementation that's shared between full and lightweight demo UIs.
class DemoApp extends App {
  private mainBoard: ClickableBoard;
  private playerElems: HTMLElement[] = [];
  private winrateGraph = new WinrateGraph('winrate-graph');
  private log = new Log('log', 'console');
  private boards: Board[] = [];

  constructor() {
    super();

    this.connect().then(() => {
      // Create boards for each of the elements in the UI.
      // The extra board views aren't available in the lightweight UI, so we
      // must check if the HTML elements exist.
      this.mainBoard = new ClickableBoard('main-board', this.rootPosition, [
          new lyr.Label(),
          new lyr.BoardStones(),
          new lyr.Variation('pv'),
          new lyr.Annotations()]);

      this.boards = [this.mainBoard];

      let searchElem = getElement('search-board');
      if (searchElem) {
        this.boards.push(new Board(searchElem, this.rootPosition, [
            new lyr.Caption('search'),
            new lyr.BoardStones(),
            new lyr.Variation('search')]));
      }

      let nElem = getElement('n-board');
      if (nElem) {
        this.boards.push(new Board(nElem, this.rootPosition, [
            new lyr.Caption('N'),
            new lyr.VisitCountHeatMap(),
            new lyr.BoardStones()]));
      }

      let dqElem = getElement('dq-board');
      if (dqElem) {
        this.boards.push(new Board('dq-board', this.rootPosition, [
            new lyr.Caption('ΔQ'),
            new lyr.DeltaQHeatMap(),
            new lyr.BoardStones()]));
      }

      this.mainBoard.onClick((p) => {
        this.playMove(this.activePosition.toPlay, p);
      });

      this.initButtons();

      // Initialize log.
      this.log.onConsoleCmd((cmd: string) => {
        this.gtp.send(cmd).then(() => { this.log.scroll(); });
      });

      this.gtp.onText((line: string) => { this.log.log(line, 'log-cmd'); });
      this.newGame();
    });
  }

  private initButtons() {
    getElement('pass').addEventListener('click', () => {
      if (this.mainBoard.enabled) {
        this.playMove(this.activePosition.toPlay, 'pass');
      }
    });

    getElement('reset').addEventListener('click', () => {
      this.gtp.newSession();
      this.newGame();
    });

    let initPlayerButton = (color: Color, elemId: string) => {
      let elem = getElement(elemId);
      this.playerElems[color] = elem;
      elem.addEventListener('click', () => {
        if (elem.innerText == HUMAN) {
          elem.innerText = MINIGO;
        } else {
          elem.innerText = HUMAN;
        }
        if (!this.engineBusy) {
          this.onPlayerChanged();
        }
      });
    };
    initPlayerButton(Color.Black, 'black-player');
    initPlayerButton(Color.White, 'white-player');
  }

  protected newGame() {
    super.newGame();
    this.log.clear();
    this.winrateGraph.newGame(this.rootPosition);
  }

  private onPlayerChanged() {
    if (this.activePosition.gameOver) {
      return;
    }

    if (this.playerElems[this.activePosition.toPlay].innerText == MINIGO) {
      this.mainBoard.enabled = false;
      this.engineBusy = true;
      this.gtp.send('genmove').finally(() => {
        this.engineBusy = false;
      });
    } else {
      this.mainBoard.enabled = true;
    }
  }

  protected onPositionUpdate(position: Position, update: Position.Update) {
    if (position != this.activePosition) {
      return;
    }
    for (let board of this.boards) {
      board.update(update);
    }
    this.winrateGraph.update(position);
  }

  protected onNewPosition(position: Position) {
    this.activePosition = position
    for (let board of this.boards) {
      board.setPosition(position);
    }
    this.winrateGraph.update(position);
    this.log.scroll();
    this.onPlayerChanged();
  }

  private playMove(color: Color, move: Move) {
    let colorStr = color == Color.Black ? 'b' : 'w';
    let moveStr = toKgs(move);
    this.gtp.send(`play ${colorStr} ${moveStr}`);
  }

  protected onGameOver() {
    this.gtp.send('final_score').then((result: string) => {
      this.log.log(toPrettyResult(result));
      this.log.scroll();
    });
  }
}

new DemoApp();
