import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SectionChildrenComponent } from './sections';

describe('Sections', () => {
  let component: SectionChildrenComponent;
  let fixture: ComponentFixture<SectionChildrenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionChildrenComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SectionChildrenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
