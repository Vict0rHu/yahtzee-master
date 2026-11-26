// SPDX-License-Identifier: MIT
// Original finite-state backward induction for the rules in docs/RULES.md.
#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <map>
#include <numeric>
#include <string>
#include <vector>

constexpr int ALL = 8191, Y = 11, YBIT = 1 << Y;
constexpr int COUNT = 8192 * 64 * 2;
using Counts = std::array<int, 6>;
struct Partial { Counts c; int n; std::array<int,6> up{}, down{}; };
std::vector<Partial> p;
std::map<Counts,int> ids;
std::array<std::vector<int>,6> level;
std::vector<double> values(COUNT, 0);
std::array<std::array<int,13>,252> score;
std::array<int,252> matching;
std::array<int,252> fullIds;
std::array<double,252> probabilities;

int indexOf(int mask, int upper, bool armed) { return ((mask * 64 + upper) * 2) + armed; }
void enumerate(int face, int left, Counts &c, int n) {
  if (face == 5) {
    c[face] = left;
    int id = p.size(); ids[c] = id; p.push_back({c,n}); level[n].push_back(id); return;
  }
  for (int a=0; a<=left; ++a) { c[face]=a; enumerate(face+1,left-a,c,n); }
}
void prepare() {
  Counts c{};
  for (int n=0; n<=5; ++n) enumerate(0,n,c,n);
  for (int id=0; id<(int)p.size(); ++id) {
    for (int f=0; f<6; ++f) {
      auto d = p[id].c;
      p[id].up[f] = p[id].down[f] = -1;
      if (p[id].n<5) { ++d[f]; p[id].up[f]=ids.at(d); --d[f]; }
      if (d[f]) { --d[f]; p[id].down[f]=ids.at(d); }
    }
  }
  constexpr int factorial[] = {1,1,2,6,24,120};
  for (int r=0; r<252; ++r) {
    int id=level[5][r]; fullIds[r]=id;
    auto &d=p[id].c; auto &s=score[r];
    int total=0, largest=0, bits=0, denom=1;
    matching[r]=-1;
    for (int f=0; f<6; ++f) {
      s[f]=d[f]*(f+1); total+=s[f]; largest=std::max(largest,d[f]);
      if(d[f]) bits|=1<<f;
      if(d[f]==5) matching[r]=f;
      denom*=factorial[d[f]];
    }
    s[6]=largest>=3?total:0; s[7]=largest>=4?total:0;
    bool two=false,three=false;
    for(int x:d){two|=x==2;three|=x==3;}
    s[8]=two&&three?25:0;
    s[9]=((bits&15)==15||(bits&30)==30||(bits&60)==60)?30:0;
    s[10]=((bits&31)==31||(bits&62)==62)?40:0;
    s[11]=largest==5?50:0; s[12]=total;
    probabilities[r]=(120.0/denom)/7776.0;
  }
}

// Every missing die is averaged exactly once; no sampled outcomes are used.
void expectation(std::array<double,462>& e) {
  for(int n=4;n>=0;--n) for(int id:level[n]) {
    double sum=0; for(int f=0;f<6;++f) sum+=e[p[id].up[f]];
    e[id]=sum/6.0;
  }
}
void chooseHolds(std::array<double,462>& e) {
  // The submultiset lattice enumerates all ways to keep zero to five dice.
  for(int n=1;n<=5;++n) for(int id:level[n])
    for(int f=0;f<6;++f) if(p[id].down[f]>=0)
      e[id]=std::max(e[id],e[p[id].down[f]]);
}
double solveState(int mask, int upper, bool armed) {
  std::array<double,462> e{};
  for(int r=0;r<252;++r) {
    int allowed=ALL^mask, match=matching[r];
    bool joker=match>=0&&(mask&YBIT);
    if(joker) {
      if(!(mask&(1<<match))) allowed=1<<match;
      else if(allowed&~63) allowed&=~63;
    }
    double best=-1e30;
    for(int c=0;c<13;++c) if(allowed&(1<<c)) {
      int pts=score[r][c];
      if(joker && c>=8 && c<=10) pts=c==8?25:c==9?30:40;
      int nextUpper=c<6?std::min(63,upper+pts):upper;
      int reward=pts+(joker&&armed?100:0)+(upper<63&&nextUpper==63?35:0);
      bool nextArmed=armed||(c==Y&&pts==50);
      double q=reward+values[indexOf(mask|(1<<c),nextUpper,nextArmed)];
      best=std::max(best,q);
    }
    e[fullIds[r]]=best;
  }
  for(int remaining=1;remaining<=2;++remaining) { expectation(e); chooseHolds(e); }
  double v=0;
  for(int r=0;r<252;++r) v+=probabilities[r]*e[fullIds[r]];
  return v;
}

int main(int argc,char**argv) {
  prepare();
  std::cerr<<"252 complete rolls; "<<p.size()<<" partial multisets\n";
  std::uint64_t solved=0;
  for(int filled=12;filled>=0;--filled) {
    for(int mask=0;mask<ALL;++mask) {
      if(__builtin_popcount((unsigned)mask)!=filled) continue;
      int maxUpper=0;
      for(int f=0;f<6;++f) if(mask&(1<<f)) maxUpper+=5*(f+1);
      maxUpper=std::min(63,maxUpper);
      for(int armed=0;armed<=(bool)(mask&YBIT);++armed)
        for(int upper=0;upper<=maxUpper;++upper) {
          values[indexOf(mask,upper,armed)]=solveState(mask,upper,armed);
          ++solved;
        }
    }
    std::cerr<<"Solved tier "<<filled<<" ("<<solved<<" states)\n";
  }
  const char* path=argc>1?argv[1]:"web/data/values.f64";
  std::ofstream out(path,std::ios::binary);
  if(!out) {std::cerr<<"Cannot open output\n";return 1;}
  for(double v:values) out.write(reinterpret_cast<const char*>(&v),sizeof v);
  std::cout.precision(15);
  std::cout<<"{\"initialEV\":"<<values[0]<<",\"statesSolved\":"<<solved
    <<",\"tableEntries\":"<<COUNT<<",\"bytes\":"<<COUNT*8<<"}\n";
}
