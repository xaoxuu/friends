# -*- coding: utf-8 -*-
# author: https://github.com/BeaCox
from bs4 import BeautifulSoup
import os
import request
import json
import config

version = 'v2'
outputdir = version  # 输出文件结构变化时，更新输出路径版本
filenames = []
json_pool = []
baselink = 'https://github.com/'


def mkdir(path):
    folder = os.path.exists(path)
    if not folder:
        os.makedirs(path)
        print("create dir:", path)
    else:
        print("dir exists:", path)

def getData(repo,parameter,sort,data_pool,json_pool):
    try:
        for number in range(1, 100):
            linklist = []
            print('page:', number)
            url = 'https://github.com/' + repo + '/issues?page=' + str(number) + '&q=is%3Aopen'
            if parameter:
                url = url + parameter
            if sort:
                url = url + '+sort%3A' + sort
            print('parse:', url)
            github = request.get_data(url)
            soup = BeautifulSoup(github, 'html.parser')
            main_content = soup.find_all('div', {'aria-label': 'Issues'})
            if len(main_content):
                linklist = main_content[0].find_all('a', {'class': 'Link--primary'})
            if len(linklist) == 0:
                print('> end')
                break
            for item in linklist:
                issueslink = baselink + item['href']
                issues_page = request.get_data(issueslink)
                issues_soup = BeautifulSoup(issues_page, 'html.parser')
                try:
                    issues_linklist = issues_soup.find_all('pre')
                    source = issues_linklist[0].text
                    if "{" in source:
                        source = json.loads(source)
                        print(source)
                        data_pool.append(source)
                except:
                    continue
    except Exception as e:
        print('> end')
    json_pool.append(data_pool)

def github_issuse(json_pool):
    print('\n')
    print('------- github issues start ----------')
    cfg = config.load()
    filter = cfg['issues']

    if not filter["groups"]:
        # 如果没有配置groups，全部输出至data.json
        data_pool = []
        filenames.append("data")
        parameter='+label%3A' + (filter["label"] if filter["label"] else '')
        getData(filter["repo"],parameter,filter["sort"],data_pool,json_pool)

    else:
        # 如果配置多个了groups，按照分组抓取并输出
        for group in filter["groups"]:
            print('start of group:', group)
            data_pool = []
            filenames.append(group)
            parameter='+label%3A' + (filter["label"] if filter["label"] else '') + '+label%3A' + group
            getData(filter["repo"],parameter,filter["sort"],data_pool,json_pool)
            print("end of group:", group)

    print('------- github issues end ----------')
    print('\n')


# 友链规则
github_issuse(json_pool)
mkdir(outputdir)
full_path = []
i = 0
for filename in filenames:
    full_path.append(outputdir + '/' + filename + '.json')
    with open(full_path[i], 'w', encoding='utf-8') as file_obj:
        data = {'version': version, 'content': json_pool[i]}
        json.dump(data, file_obj, ensure_ascii=False, indent=2)
    i += 1