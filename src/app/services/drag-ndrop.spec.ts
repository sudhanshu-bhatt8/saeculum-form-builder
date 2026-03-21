import { TestBed } from '@angular/core/testing';

import { DragNDrop } from './drag-ndrop';

describe('DragNDrop', () => {
  let service: DragNDrop;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DragNDrop);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
