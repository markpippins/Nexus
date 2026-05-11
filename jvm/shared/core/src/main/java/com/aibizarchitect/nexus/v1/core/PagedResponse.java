package com.aibizarchitect.nexus.v1.core;
import java.util.List;
public class PagedResponse<T> {
  private List<T> data;
  private long totalElements;
  private int totalPages;
  private int number;
  private int numberOfElements;
  private int size;
  public PagedResponse() {}
  public List<T> getData() { return data; }
  public void setData(List<T> data) { this.data = data; }
  public long getTotalElements() { return totalElements; }
  public void setTotalElements(long totalElements) { this.totalElements = totalElements; }
  public int getTotalPages() { return totalPages; }
  public void setTotalPages(int totalPages) { this.totalPages = totalPages; }
  public int getNumber() { return number; }
  public void setNumber(int number) { this.number = number; }
  public int getNumberOfElements() { return numberOfElements; }
  public void setNumberOfElements(int numberOfElements) { this.numberOfElements = numberOfElements; }
  public int getSize() { return size; }
  public void setSize(int size) { this.size = size; }
}
